---
name: spec-workbench-review
description: Review either a Feature (design, optional prototype, and code changes) or a single Ticket (ticket slice, optional prototype, and code changes), grouped by Node, without generating result files.
disable-model-invocation: true
---

Default scope: **Feature** (or **Ticket** if a ticket path/id is given). Default base: `main` (or the feature's linked files + uncommitted changes).

Do **not** generate any `docs/results/` HTML file. Return the structured review findings directly in the session reply.

## Review Modes

1. **Feature Review (按需求评审)**:
   - Target: `docs/features/<id>/design.html`, its `docs/features/<id>/tickets/*.html` (if any), its `docs/features/<id>/prototype.html` (**must also be reviewed whenever it exists**), and the code diff / linked files for all Nodes in the feature.
2. **Ticket Review (按工单评审)**:
   - Target: `docs/features/<id>/tickets/<NN-slug>.html`, its parent `docs/features/<id>/design.html`, `docs/features/<id>/prototype.html` (**must also be reviewed if it exists** and draws any Node delivered by this ticket), and the code changes / linked files for that ticket.

## Steps

1. Spawn the `spec-workbench-reviewer` subagent with the exact scope (Feature or Ticket):
   - Instruct it to check:
     - **Design / Ticket compliance**: each delivered Node matches its spec, `data-doc-links` and `done-when` criteria, edge/error paths, and tests at public seams.
     - **Code diff**: group hunks by Node (`lumzel:<doc-id>#<node-id>` or `data-doc-links`), ranking findings `blocker`, `major`, `minor` with `file:line`, cause, and fix.
     - **Prototype check (whenever `docs/features/<id>/prototype.html` exists)**: verify every screen (`data-doc-screen`) and `data-goto` transition covers the `flow` steps, every `data-doc-node` resolves, and the UI states/layout/interactions in code and prototype stay consistent.
   - Explicitly forbid writing `docs/results/` files.
2. Output the structured review report clearly in chat (summary verdict, counts by severity, per-Node checklist, prototype review section if generated, and findings most severe first). Do not edit code unless the user asks; when asked to fix, spawn `spec-workbench-builder`.
