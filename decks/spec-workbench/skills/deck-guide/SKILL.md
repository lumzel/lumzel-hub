---
name: deck-guide
description: Which 方案工作台 skill fits now? A router over the design-to-delivery flow.
disable-model-invocation: true
---

# 方案工作台 guide

Before recommending a skill, read its `SKILL.md`: the summaries here are orientation only.

## Main flow: idea → shipped

Every arrow into a GATE waits for the human.

1. **`deck-grilling`** sharpens the idea by interview. The decision tree lives in the design doc, not in chat.
2. **`/deck-to-design`** turns the settled tree into the design: flow, architecture, data, API, risks. A reviewer checks it first. **GATE: the human confirms the doc.**
3. **Optional: `/deck-to-prototype`** draws the screens as one clickable, offline `docs/features/<id>/prototype.html`. Use it while the look is still open. **GATE: the human clicks through.** Feedback that changes a Node or a decision goes back through `/deck-to-design`; the prototype follows the doc.
4. **More than one sitting of work?**
   - Yes → **`/deck-to-tickets`** cuts the confirmed doc into vertical-slice tickets under `docs/features/<id>/tickets/`, each linking the Nodes it delivers. **GATE: the human accepts the tickets.** Then **`/deck-implement`**: the next ready ticket by default, `/deck-implement <NN>` for one, `/deck-implement all` for every ticket in blocker order.
   - No → **`/deck-implement`** right here, on the Nodes named in the request.
   Both build through `deck-tdd` and keep the doc true through `deck-html`, so status moves as code lands.
5. **`/deck-review`** reviews the diff grouped by Node. **GATE: merge.**

## Side doors

- **"Draw it" / "explain this"**: `deck-html` writes the answer as a Visual Doc in `docs/results/`.
- **"Change this"**: a message with a Node ref (`<doc-id>#<node-id>`) is a pointed edit; `deck-html` handles it.
- **"Is the doc still true?"**: `deck-html` › Keep the doc true, then `doc check`.

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
| `deck-grilling` | the main Session (interview); `deck-scout` for facts | — |
| `/deck-to-design` | `deck-writer` | `deck-reviewer` |
| `/deck-to-prototype` | `deck-writer` | the human |
| `/deck-to-tickets` | `deck-writer` | `deck-reviewer` |
| `/deck-implement` | `deck-builder` (`deck-scout` reads the choices) | `/deck-review` |
| `/deck-review` | — | `deck-reviewer` |

The four subagents ship with this Deck. A Session that cannot spawn subagents does each brief itself, one at a time.
