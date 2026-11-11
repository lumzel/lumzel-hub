---
name: deck-to-tickets
description: Cut a confirmed Visual Doc into reviewed vertical-slice tickets with blocking edges.
disable-model-invocation: true
---

You orchestrate; subagents read and write. Keep your own context to their short replies. Never open the tickets yourself.

1. Spawn the `deck-writer` subagent with this brief (fill in `<doc-id>`):
   > Input: `docs/features/<doc-id>/design.html`, which must have `data-doc-status="confirmed"` on its `<html>`.
   > 0. If the UI already runs on mock data, slices wire the real backend behind those screens, and each slice deletes the mock handlers it replaces (a `done-when` item says so). Link the existing components; never rebuild them.
   > 1. Slice **vertically**: each ticket is a tracer bullet through every layer it needs (UI, API, data, test) and is demoable alone. Never one ticket per layer.
   > 2. Each ticket names the Node ids it delivers. Every code-bound Node lands in exactly one ticket.
   > 3. For each ticket run `scaffold ticket <doc-id> <NN-slug>` and edit the scaffold (`tickets/<NN-slug>.html`) in place; it is an HTML doc (call the Skill tool with "deck-html" for the contract). A ticket is the design of its slice, one level deeper than the doc, not a task list:
   >    - The `<title>` and `<header data-doc-summary>`: title `NN <title>`, then a one-line summary ending with its blockers (`依赖：工单 01、03` or `依赖：无`).
   >    - **Design blocks first** (keep the ones that apply, at least one; `check` enforces it):
   >      - `architecture` `slice`: the modules and files this slice touches, each Node's `data-doc-links` with the file and, when it implements a doc Node, `docs/features/<doc-id>/design.html#<node-id>`.
   >      - `sequence` `seq`: the key interaction, message by message. No self-messages.
   >      - `api-table` `contracts`: exact signatures, payload shapes, error cases.
   >      - `er` or a `table` for data that the doc only sketches.
   >      - `decisions` `choices`: choices this slice has to make, each with `data-doc-recommend` and a why. Prefer a maintained library over custom code. Leave `data-doc-answer` empty unless the doc already settled it.
   >      - `table` `tests`: layer, what, how. Say what cannot be automated and why.
   >      - `callout` for the one risk the builder must not miss.
   >    - `done-when` block (`data-doc-block="done-when"`): one item per observable behavior at a confirmed seam.
   >    - `delivers` block (`data-doc-block="delivers"`): one row per Node, `data-doc-node="n-<node-id>"`, `data-doc-delivers="docs/features/<doc-id>/design.html#<node-id>"`, `data-doc-status` copied from that Node. A ticket with no new Node links the doc's own `tickets` item instead.
   > 4. Add or replace a `checklist` block `tickets` in the design doc: one row per ticket with `data-doc-node`, `data-doc-ticket="<ticket path>"`, `data-doc-links="<ticket path>"`, `data-doc-blocked-by="<blocker row ids>"`.
   > 5. Do not append ticket paths to the doc's Node `data-doc-links`: `doc trace` derives the Trace from `delivers` and `data-doc-blocked-by`, so each Node shows its 工单 chip, each ticket shows its design Nodes, prototype screens, blockers and what it unblocks. Only a grouping Node no ticket delivers (a `flow` phase) may link the tickets it groups.
   > 6. Run `doc check`, then `doc trace <doc-id>` to confirm every Node lists its tickets. `check` fails on a ticket with no design block, a `delivers` that disagrees with its Node, a code-bound Node in two tickets, or a `data-doc-blocked-by` cycle; it warns on a code-bound Node in no ticket.
2. Spawn the `deck-reviewer` subagent: "Review the tickets of `<doc-id>`."
3. If it reports any `blocker`, spawn the `deck-writer` again with the result path and "fix every blocker, then majors where cheap". Then re-run step 2. At most 2 fix rounds; carry what is left to the gate.
4. **GATE.** Show the feature's tickets in Lumzel (each ticket's 联动 strip links its design Nodes and prototype screens; `doc trace <doc-id>` prints the same links), the ticket count, the first unblocked ticket, the review result path and the remaining findings. Wait for the human before anyone runs `/deck-implement`.
