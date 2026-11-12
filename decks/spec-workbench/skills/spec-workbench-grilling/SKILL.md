---
name: spec-workbench-grilling
description: Interview the user relentlessly about a plan, mapping it as a visible decision tree. Use when the user wants to stress-test an idea, align before building, or says grill, 拷问, 先问清楚.
---

Interview the user until you reach a shared understanding. Map it as a **design tree**: every decision branches into the decisions that hang off it.

## Keep the tree visible

Keep the tree in a `decisions` block of the Visual Doc for this work (`docs/features/<id>/design.html`; run `scaffold design <id>` if none exists). Call the Skill tool with "spec-workbench-html" for the contract. Each decision is one `data-doc-node` element: question, options, `data-doc-recommend`, `data-doc-depends` (ids of parent decisions). When the user answers, fill `data-doc-answer` and the why. Lay it out so children sit under their `data-doc-depends` parent, so the human sees the tree, what is settled and what is open.

## Rounds

The **frontier** is every open decision whose `data-doc-depends` are all answered. Ask the whole frontier in one round, then wait.

```
❓ **Q1** - **<title>**: <question, with choices>

➡️ <recommended answer>
```

Word each question so "yes" accepts your recommendation. After each round: update the doc, recompute the frontier, ask again. A question that depends on another open question in the same round waits for a later round.

## Facts vs decisions

Facts are your job: when a question needs a fact from the code or environment, look it up (or send a subagent) instead of asking. Ask only the questions downstream of a pending lookup later. Decisions are the user's: put each to them and wait.

Done when the frontier is empty. Run `doc check`, give the doc path, and do not act until the user confirms the shared understanding.
