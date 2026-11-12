---
name: spec-workbench-to-prototype
description: Optional. Draw a confirmed design as one clickable, offline HTML prototype and let the human react before any product code.
disable-model-invocation: true
---

The prototype stays plain HTML (`prototype.html`, not a Visual Doc): its `data-doc-node` refs name Nodes of the `design.html` doc, and screens are named after `flow` step ids. Optional step between `/spec-workbench-to-design` and `/spec-workbench-to-tickets`. Skip it when the feature has no UI or the human already knows what it looks like.

You orchestrate; subagents read and write. Keep your own context to their short replies. Never open the prototype yourself.

1. Spawn the `spec-workbench-scout` subagent: "Is `docs/features/<id>/design.html` `confirmed`? List its user-facing `flow` steps, one line each." Not confirmed: stop and point at `/spec-workbench-to-design`.
2. Spawn the `spec-workbench-writer` subagent: "Prototype `docs/features/<id>/design.html` into `docs/features/<id>/prototype.html`, following the **Prototype contract** below." Paste the contract into the brief. If it returns open questions, show them and stop.
3. **GATE.** Show `docs/features/<id>/prototype.html` (also the feature's 原型 tab in Lumzel) and ask the human to click through; F or ⛶ 全屏 previews it fullscreen, L then a click shows that element's design Node and tickets in 本屏联动. Feedback that only changes the look: spawn the `spec-workbench-writer` again with the feedback, then repeat this gate. Feedback that changes a Node or a decision: stop and send it back through `/spec-workbench-to-design`; the prototype follows the doc, never the reverse.
4. On yes, offer the next step: `/spec-workbench-to-tickets`.

## Prototype contract

- One self-contained HTML file: inline CSS and data, no network, no build step. It follows the project's `DESIGN.md` when there is one.
- One `<section data-doc-screen="<screen-id>" data-doc-title="<label>">` per screen; screen ids are the design doc's `flow` step ids. One screen is visible at a time.
- `data-goto="<screen-id>"` on every clickable element that changes screen.
- `data-doc-node="<doc-id>#<node-id>"` on each screen and on each element that maps to a design Node. Every screen draws at least one.
- An optional `<p data-doc-intro>` per screen says what to try on it.
- The page loads no runtime script: this Deck adds `runtime/prototype.js` when it shows the prototype.
