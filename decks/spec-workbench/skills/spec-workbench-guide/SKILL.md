---
name: spec-workbench-guide
description: Which 方案工作台 skill fits now? A router over the design-to-delivery flow.
disable-model-invocation: true
---

# 方案工作台 guide

Before recommending a skill, read its `SKILL.md`: the summaries here are orientation only.

## Main flow: idea → shipped

Every arrow into a GATE waits for the human.

1. **`spec-workbench-grilling`** sharpens the idea by interview. The decision tree lives in the design doc, not in chat.
2. **`/spec-workbench-to-design`** turns the settled tree into the design: flow, architecture, data, API, risks. A reviewer checks it first. **GATE: the human confirms the doc.**
3. **Optional: `/spec-workbench-to-prototype`** draws the screens as one clickable, offline `docs/features/<id>/prototype.html`. Use it while the look is still open. **GATE: the human clicks through.** Feedback that changes a Node or a decision goes back through `/spec-workbench-to-design`; the prototype follows the doc.
4. **More than one sitting of work?**
   - Yes → **`/spec-workbench-to-tickets`** cuts the confirmed doc into vertical-slice tickets under `docs/features/<id>/tickets/`, each linking the Nodes it delivers. **GATE: the human accepts the tickets.** Then **`/spec-workbench-implement`**: the next ready ticket by default, `/spec-workbench-implement <NN>` for one, `/spec-workbench-implement all` for every ticket in blocker order.
   - No → **`/spec-workbench-implement`** right here, on the Nodes named in the request.
   Both build through `spec-workbench-tdd` and keep the doc true through `spec-workbench-html`, so status moves as code lands.
5. **`/spec-workbench-review`** reviews the diff grouped by Node. **GATE: merge.**

## Side doors

- **"Draw it" / "explain this"**: `spec-workbench-html` writes the answer as a Visual Doc in `docs/results/`.
- **"Change this"**: a message with a Node ref (`<doc-id>#<node-id>`) is a pointed edit; `spec-workbench-html` handles it.
- **"Is the doc still true?"**: `spec-workbench-html` › Keep the doc true, then `doc check`.

## Where things live

| What | Path |
|---|---|
| Design of a Feature | `docs/features/<id>/design.html` |
| Its tickets | `docs/features/<id>/tickets/<NN-slug>.html` |
| Its prototype | `docs/features/<id>/prototype.html` |
| Decisions that are hard to reverse | `docs/adr/<NNNN-slug>.html` |
| Answers for this machine only | `docs/results/<id>.html` |

## Who does what

| Step | Writes | Reviews |
|---|---|---|
| `spec-workbench-grilling` | the main Session (interview); `spec-workbench-scout` for facts | — |
| `/spec-workbench-to-design` | `spec-workbench-writer` | `spec-workbench-reviewer` |
| `/spec-workbench-to-prototype` | `spec-workbench-writer` | the human |
| `/spec-workbench-to-tickets` | `spec-workbench-writer` | `spec-workbench-reviewer` |
| `/spec-workbench-implement` | `spec-workbench-builder` (`spec-workbench-scout` reads the choices) | `/spec-workbench-review` |
| `/spec-workbench-review` | — | `spec-workbench-reviewer` |

The four subagents ship with this Deck. A Session that cannot spawn subagents does each brief itself, one at a time.
