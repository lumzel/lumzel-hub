---
name: speckit-tasks
description: Generate a dependency-ordered, user-story-grouped task list with explicit parallelization markers ([P]) and contract test gates.
---

# Spec-Kit Task Breakdown (`/speckit.tasks`)

Convert the technical plan into an executable, dependency-ordered task list grouped by User Story so each story can be delivered and verified independently.

## Phase Structure

- **Phase 1 — Setup & Shared Contracts**: Project initialization, shared types, and schema definitions.
- **Phase 2 — Foundational Prerequisites**: Blocking infrastructure required before user stories.
- **Phase 3+ — User Story Phases (`[US1]`, `[US2]`, ...)**:
  - Contract & integration tests first (marked `[P]` when parallelizable across distinct files).
  - Model/service/UI implementation tasks with exact file paths.
  - Checkpoint verification command for the story.
- **Final Phase — Cross-Cutting Polish & Audit**: Performance, accessibility, and documentation check.
