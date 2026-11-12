---
name: spec-workbench-review
description: Review the current diff against its Visual Doc, grouped by Node, by a reviewer subagent, as a Visual Result.
disable-model-invocation: true
---

Default base: `main`. The user may pass another branch, a PR or a path.

1. Spawn the `spec-workbench-reviewer` subagent: "Review the diff `<base>...HEAD` plus uncommitted changes, grouped by Node. Write `docs/results/review-<branch>.html`." Its role carries the procedure: one checklist per Node, findings most severe first with `file:line`, cause and fix.
2. Reply with the result path and the top finding. Do not fix anything unless asked; when asked, spawn the `spec-workbench-builder` with the result path.
