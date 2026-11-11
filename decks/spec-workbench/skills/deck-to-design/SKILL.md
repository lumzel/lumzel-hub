---
name: deck-to-design
description: Turn the settled Session into a reviewed, confirmed Visual Doc design. No interview, just synthesis.
disable-model-invocation: true
---

You orchestrate; subagents read and write. Keep your own context to their short replies. Never open the design doc yourself.

1. Spawn the `deck-writer` subagent with this brief:
   > Synthesize `docs/features/<id>/design.html` from its settled `decisions` block. Do not interview. Fill these blocks in order, skipping any that do not apply:
   > - `kpi`: scope at a glance (Nodes, endpoints, tables, risks)
   > - `flow`: the user-facing path, with `data-doc-gate` on human checkpoints
   > - `architecture`: modules and edges; new modules `data-doc-status="planned"`, touched ones `"changed"`
   > - `sequence`: the one interaction that is hardest to get right
   > - `er`, `api-table`: data and contract
   > - `decisions`: keep the settled tree from grilling
   > - `table` of risks (risk, likelihood, impact, response), then a `callout` for the single biggest one
   >
   > Give every code-bound Node `data-doc-status="planned"` and `data-doc-links` to the files, `table:` and `test:` it will touch. Write it as a self-contained HTML doc (call the Skill tool with "deck-html" for the contract). Name the test seams in the Node's `data-doc-note`; prefer few, high seams.

   Paste any decisions settled in this Session but missing from the doc into the brief. If it returns open decisions, stop and show them.
2. Spawn the `deck-reviewer` subagent: "Review `docs/features/<id>/design.html`."
3. If it reports any `blocker`, spawn the `deck-writer` again with the result path and "fix every blocker, then majors where cheap". Then re-run step 2. At most 2 fix rounds; carry what is left to the gate.
4. **GATE.** Show the doc path, the review result path, and the remaining findings by severity. Ask the human to confirm. On yes, run `doc confirm <id>`. Do not open the doc to do it.
