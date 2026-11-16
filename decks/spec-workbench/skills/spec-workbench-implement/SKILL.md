---
name: spec-workbench-implement
description: Implement a feature directly from its design doc or automatically split multiple tickets into sequential spec-workbench-builder subagents (one ticket per subagent) while the main Agent reviews each result and the final diff.
disable-model-invocation: true
---

You (the **main Agent**) orchestrate and **review**; **`spec-workbench-builder` subagents** implement one ticket (or feature slice) at a time. Never edit product code yourself when subagents are available, and never generate `docs/results/` files.

## Mode

Read the mode from the arguments. Default is **next** when tickets exist, or **feature** when no tickets exist.

| Argument | Mode | Scope |
|---|---|---|
| none, `next` | next | the first ready ticket (not `done`, every `data-doc-blocked-by` done), then stop; if no tickets exist, implement from `design.html` |
| a ticket path, `NN` or `NN-slug` | one | that ticket only |
| `all` (optionally `all <doc-id>`) | all | every not-done ticket of the feature, automatically split into one `spec-workbench-builder` subagent per ticket in `data-doc-blocked-by` order, reviewed one by one by the main Agent |
| `feature <doc-id>` or no tickets exist | feature | implement directly from `docs/features/<doc-id>/design.html` (tickets and prototype are optional) |

Several features exist and none named: ask which one.

## Progress is mandatory

The doc (`tickets/<NN>.html` or `design.html` in `feature` mode) is the live progress board. Nobody batches status writes to the end.

- **With tickets**: a ticket's status is its `done-when` checklist (Lumzel derives it). Its item in the design doc's `tickets` checklist mirrors it.
  - On start: the design `tickets` item → `in-progress`; the first `done-when` item being worked → `in-progress`.
  - Each time a `done-when` item's test passes: that item → `done`, its `data-doc-note` says which test proves it. Same for each `delivers` item and its design Node when the Node is built.
  - On failure or stop: the item stays `in-progress`, its `data-doc-note` names location, cause and fix.
- **Without tickets (`feature` mode)**: update each code-bound Node directly in `docs/features/<doc-id>/design.html` (`data-doc-status="in-progress"` on start, `"done"` with `data-doc-note` naming the proving test once passing).
- Validate with `pnpm lumzel check` (when `scripts/lumzel.mjs` is present) or the `spec-workbench-html` checklist after edits.

## Steps

1. **Scout (`spec-workbench-scout`)**:
   - When tickets are in scope: "For tickets `<paths in scope>`: list each one's open `choices` items (no `data-doc-answer`) as `ticket — id — question — recommend — why`, and its blockers from the design doc's `tickets` checklist with their status. Also note whether `docs/features/<doc-id>/prototype.html` exists. For `next`/`all`, return the exact topological ready order."
   - In `feature` mode (no tickets): "For `docs/features/<doc-id>/design.html`: list any open `decisions` (no `data-doc-answer`), all planned/in-progress Nodes, and whether `docs/features/<doc-id>/prototype.html` exists."
2. **GATE.** A blocker not `done` and not earlier in this run: say so and stop. Open choices/decisions: show them all at once with their `data-doc-recommend` and wait for the human's answers (unless the prompt already supplied them). Mode `all` asks once, for every ticket in scope.
3. **Sequential subagent implementation (one ticket per subagent)**:
   - In multi-ticket (`all`) mode, process the unfinished tickets strictly in dependency (`data-doc-blocked-by`) order — spawn **one dedicated `spec-workbench-builder` subagent per ticket**, one after another (never two builders in parallel, since they share code and docs).
   - Pass in each builder brief:
     - The target ticket path (or `docs/features/<doc-id>/design.html` in `feature` mode),
     - `docs/features/<doc-id>/prototype.html` if generated (so implemented UI matches the prototype),
     - Any Deck run parameters (`tddStrictness`, `designRules`) supplied in the prompt,
     - The human's answers to `choices` / `decisions`,
     - The **Progress is mandatory** rules.
4. **Main Agent review of each subagent result (mandatory after every ticket)**:
   - Do **not** blindly trust the builder's summary. The **main Agent** directly reviews each builder subagent's result before accepting the ticket and moving to the next one:
     - Inspect the ticket HTML (`done-when`, `delivers`, `data-doc-note`) — or, in `feature` mode, the Nodes (`data-doc-status`, `data-doc-note`) in `docs/features/<doc-id>/design.html` — and validate with `pnpm lumzel check` if configured. Verify every `done-when` / Node in scope is `done` with test proof.
     - Inspect `git diff` / changed files and verify the builder's test & lint commands actually cover the ticket's or feature's acceptance criteria, edge/error cases, and `lumzel:<doc-id>#<node-id>` tags.
     - If `docs/features/<doc-id>/prototype.html` exists and the slice touches UI, check that components/states match the prototype.
   - **If review finds blockers, missing tests, or doc/spec drift**: treat it as a failure and re-spawn `spec-workbench-builder` for that same ticket with your exact review findings (retry 1: standard model; if it fails a second time: retry 2 on the strongest model with both failure/review logs). If still failing after retry 2, stop the entire run (mode `all` included) and report the blocker and doubtful assumption.
5. **Advance (`all` mode)**:
   - Only after the ticket passes the main Agent's review, output one progress line (e.g. `3 of 7 implemented & reviewed: 03-first-session`) and spawn the next ticket's `spec-workbench-builder` subagent.
6. **Final Main Agent review & GATE**:
   - In multi-ticket (`all`) mode, once all tickets pass step 4, perform a brief end-to-end review across the combined diff, full test suite, `design.html`, and `prototype.html` (if present).
   - Output directly in chat (never write `docs/results/` files): implemented tickets/Nodes, test verification results, main Agent review findings (if any minor notes remain), and next ready ticket if any. Do not commit unless asked.
