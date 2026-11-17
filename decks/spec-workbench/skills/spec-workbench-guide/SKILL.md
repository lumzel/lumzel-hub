---
name: spec-workbench-guide
description: Which Spec Workbench skill fits now? A router over the design-to-delivery flow.
disable-model-invocation: true
---

# Spec Workbench Guide

Before recommending a skill, read its `SKILL.md`: the summaries here are orientation only.

## Main flow: idea → shipped

Every arrow into a GATE waits for the human. **Prototype and tickets are both optional.**

1. **`spec-workbench-grilling`** sharpens the idea by interview. The decision tree lives in `docs/features/<id>/design.html`, and can be answered in chat or directly inside the Deck UI.
2. **`/spec-workbench-to-design`** turns the settled tree into the design: flow, architecture, data, API, risks. A reviewer checks it first. **GATE: the human confirms the doc.**
3. **Optional: `/spec-workbench-to-prototype`** draws the screens as one clickable, offline `docs/features/<id>/prototype.html`. Triggered one-click from the Deck whenever UI preview is helpful.
4. **Optional: `/spec-workbench-to-tickets`** cuts the design into vertical-slice tickets under `docs/features/<id>/tickets/`, each linking the Nodes it delivers. Users can implement tickets one-by-one, next-ready, or all at once (`all <id>`), or skip tickets and run **`/spec-workbench-implement`** directly from `design.html`.
   Both build through `spec-workbench-tdd` and keep `design.html` / `tickets/*.html` true through `spec-workbench-html`.
5. **`/spec-workbench-review`** reviews either a **Feature** or a **Ticket** (plus `prototype.html` whenever generated) and prints findings directly in chat without generating `docs/results/` files.

## Pointed edits & syncing

- **"Change this"**: a message with a Node ref (`<doc-id>#<node-id>`) is a pointed edit; `spec-workbench-html` handles it.
- **"Is the doc still true?"**: `spec-workbench-html` › Keep the doc true, then `pnpm lumzel check` (when configured) or the `spec-workbench-html` checklist.
- **Never generate `docs/results/*.html` files**: this workbench only manages feature designs (`design.html`), tickets (`tickets/*.html`), and prototypes (`prototype.html`).

## Where things live

| What | Path |
|---|---|
| Design of a Feature | `docs/features/<id>/design.html` |
| Its tickets (optional) | `docs/features/<id>/tickets/<NN-slug>.html` |
| Its prototype (optional) | `docs/features/<id>/prototype.html` |

## Who does what

| Step | Writes | Reviews |
|---|---|---|
| `spec-workbench-grilling` | the main Session (interview); `spec-workbench-scout` for facts | — |
| `/spec-workbench-to-design` | `spec-workbench-writer` | `spec-workbench-reviewer` |
| `/spec-workbench-to-prototype` | `spec-workbench-writer` | the human |
| `/spec-workbench-to-tickets` | `spec-workbench-writer` | `spec-workbench-reviewer` |
| `/spec-workbench-implement` | `spec-workbench-builder` per ticket (`spec-workbench-scout` reads choices) | the main Session (reviews each subagent result & final diff) |
| `/spec-workbench-review` | — | `spec-workbench-reviewer` |

The four subagents ship with this Deck. A Session that cannot spawn subagents does each brief itself, one at a time.
