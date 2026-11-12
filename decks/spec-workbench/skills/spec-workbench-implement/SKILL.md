---
name: spec-workbench-implement
description: Implement tickets test-first by a builder subagent, one at a time by default (or one named ticket, or all), writing live progress into each ticket.
disable-model-invocation: true
---

You orchestrate; subagents read and write. Keep your own context to their short replies.

## Mode

Read the mode from the arguments. Default is **next**.

| Argument | Mode | Scope |
|---|---|---|
| none, `next` | next | the first ready ticket (not `done`, every `data-doc-blocked-by` done), then stop |
| a ticket path, `NN` or `NN-slug` | one | that ticket only |
| `all` (optionally `all <doc-id>`) | all | every not-done ticket of the feature, in `data-doc-blocked-by` order, one after another |
| no tickets exist | request | the Nodes named in the request; skip progress writes that need a ticket |

Several features with tickets and none named: ask which one.

## Progress is mandatory

The ticket file is the live progress board. Nobody batches status writes to the end.

- A ticket's status is its `done-when` checklist (Lumzel derives it). Its item in the design doc's `tickets` checklist mirrors it.
- On start: the design `tickets` item → `in-progress`; the first `done-when` item being worked → `in-progress`.
- Each time a `done-when` item's test passes: that item → `done`, its `data-doc-note` says which test proves it. Same for each `delivers` item and its design Node when the Node is built.
- On failure or stop: the item stays `in-progress`, its `data-doc-note` names location, cause and fix.
- A status write is an edit of the element's attributes in the ticket HTML (`data-doc-status="in-progress"`, `"done"`, `data-doc-note`); Lumzel reloads the doc on save, so the ticket view shows it at once. Run `doc check` after the batch of edits for an item.

## Steps

1. Spawn the `spec-workbench-scout` subagent: "For tickets `<paths in scope>`: list each one's open `choices` items (no `data-doc-answer`) as `ticket — id — question — recommend — why`, and its blockers from the design doc's `tickets` checklist with their status. For `next`/`all`, also give the ready order." Mode `request`: skip to step 3.
2. **GATE.** A blocker not `done` and not earlier in this run: say so and stop. Open choices: show them all at once with their `data-doc-recommend` and wait for the human's answers. Mode `all` asks once, for every ticket in scope.
3. For each ticket in order, spawn the `spec-workbench-builder` subagent: "Implement `<ticket path>`. Answers to its choices: <id: answer, …>. Write progress into the ticket as you go, per the **Progress is mandatory** rules below." Paste those rules into the brief. One ticket per builder; never two in parallel (they share the docs).
4. After each builder reply, read the ticket's `done-when` statuses. Not all `done` while the builder says success counts as failure. On failure, spawn it again once with its own failure reply. If it fails again, re-spawn it on the strongest model (Claude: `model: opus`; Codex: `model_reasoning_effort: high`) with both replies. After that, stop the run (mode `all` included) and name the doubtful assumption.
5. Mode `all`: after each ticket, say one line (`3 of 7 done: 03-first-session`) and go on to the next. Modes `next`/`one`: go to step 6.
6. **GATE.** Report what now works, the ticket paths and statuses, and the next ready ticket (ask the `spec-workbench-scout` if unsure). Suggest `/spec-workbench-review`. Do not commit unless asked.
