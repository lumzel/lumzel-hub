---
name: spec-workbench-html
description: Write structured output as a self-contained HTML Visual Doc (design, ticket, ADR, answer) that the 方案工作台 Deck shows, instead of Markdown. Use when output has components, flows, data models, APIs, states, decisions, trade-offs or task lists, or when the user says 画图, 可视化, 看不懂, show me, diagram.
---

# HTML doc

Agents produce text faster than humans read it. A Visual Doc moves the reading cost onto the layout: the human sees the shape first, then drills into a Node. When the project has a `GLOSSARY.md`, use its terms.

A Visual Doc is one self-contained HTML page. Layout is HTML and inline SVG styled only by this Deck's runtime; **meaning lives only in `data-doc-*` attributes**, which Lumzel reads to build the Feature list, the ticket board and the Trace. [STYLE.md](STYLE.md) is the look: one design language and five page recipes. [REFERENCE.md](REFERENCE.md) is the contract: page shell, every attribute, the canonical markup of each block kind. Read both before writing a block you have not written this session.

## Decide: doc or chat

Render a Visual Doc when the answer has **two or more** of: named parts, relations between parts, a sequence, a state, a choice between options, more than 5 list items. Otherwise answer in chat, in under 10 lines.

## Write the doc

1. Pick the file and scaffold it (see **Scaffold, check, confirm** below).
   - Shared and lasting (feature design, anything teammates read): `docs/features/<id>/design.html` via `scaffold design <id>`. Committed.
   - Answer to the user (explanation, review, investigation): `docs/results/<id>.html` via `scaffold result <id>`. Commit it or not, as the project prefers.
   - Ticket of a design doc: `scaffold ticket <doc-id> <NN-slug>` → `docs/features/<doc-id>/tickets/<NN-slug>.html` (see the spec-workbench-to-tickets skill). ADR: `scaffold adr <NNNN-slug>` → `docs/adr/<NNNN-slug>.html`. Both are Visual Docs too; there is no Markdown page type.
   To keep a result, move it to `docs/features/<id>/design.html`.
2. Edit the scaffold in place. Keep the `<html data-doc-*>` attributes and the hero. The page links no stylesheet and no script: this Deck adds its own (`runtime/doc.css`, `runtime/doc.js`) when it shows the doc, so the doc reads styled inside Lumzel and as plain HTML anywhere else.
3. Pick the page recipe by the question the reader asks (answer, compare, review, design, adr in [STYLE.md](STYLE.md)) and write its blocks in its order.
4. Copy each block's markup from [REFERENCE.md](REFERENCE.md) with its class names. The look comes only from this Deck's `runtime/doc.css`: no `<link>`, no `<style>`, no hex colours, no fonts, CDNs or images by URL.
5. Give every Node a stable kebab-case `data-doc-node` id, unique in the doc. Ids are addresses (`<doc>#<node>`): never rename one that code already tags.
6. Every Node that is or will be code carries `data-doc-links`. `planned` Nodes may link to files that do not exist yet. Link related docs too (`docs/features/<id>/design.html#<node>`, `docs/adr/NNNN-*.html`): those Links are the cross-doc edges.
7. Run `doc check <file>` and fix what it finds.
8. In chat, give the path and at most three lines on what to look at first.

## Rules

- **Lead with shape.** First block answers "what is this" in one glance: `kpi`, `flow` or `architecture`. Detail blocks come after.
- **One idea per block.** A block that needs a paragraph of lead text is two blocks.
- **Status is honest.** `planned` until code exists, `done` only when tests pass, `drift` when code and doc disagree.
- **Open questions stay visible.** Unanswered items live in a `decisions` block with `data-doc-recommend`, not buried in prose.
- **Two-way links.** A Node that maps to code links it in `data-doc-links`; the code carries `lumzel:<doc-id>#<node-id>` back.
- **Meaning in attributes, not layout.** Status, links, blockers and answers are read from `data-doc-*` only; text and styling are for the human.

## Pointed edit

The user pointed at something instead of describing it. Do not ask where it is. Use this when the message contains a lumzel.context/v1 JSON, a ref like `invoice-cache#redis`, a `data-doc-src` or `src` location, or the user says 改这个.

1. Parse the pack: `ref` (`<doc-id>#<node-id>`), `doc` path, `links`, `src` (`file:line`), `intent`.
2. Open the doc and read that Node's element (`data-doc-node="<node-id>"`) and its neighbours (same `data-doc-block`; edges or arrows that name it).
3. Find the target.
   - `src` is a doc `.html` under `docs/` or `docs/results/`: the pack points at a Node. Edit that element in place. The Node ref is unchanged by an edit to its text or other `data-doc-*` attributes; a rename is a new address, so do not rename an id that code tags.
   - Otherwise the code: the Node's `data-doc-links` first, then `git grep "lumzel:<ref>"`. A preview element carries `data-doc-src="file:line"`; use that directly.
   - No `src`, only `ref`: find the Node with `git grep -n 'data-doc-node="<node-id>"' -- '<doc>'`; its line number is the `src`.
4. If `intent` is empty, ask one question: what should change.
5. Design-only intent ("split this service"): edit the doc, then stop at a gate. Code intent: edit code test-first (call the Skill tool with "spec-workbench-tdd") and keep the `lumzel:` tag on the symbol.
6. Sync the doc (the section below) so status and links match the new code.
7. Reply in two lines: what changed at which `file:line`, and which Node moved to which status.

## Keep the doc true

The doc goes stale the moment code moves. Close the gap before reporting done. Use this after editing code that has `lumzel:` tags or appears in a Node's links, after finishing a ticket, or when `doc check` finds broken links or dangling tags.

1. List what changed: `git diff --name-only` plus untracked files.
2. For each changed file, find its Nodes: `git grep -n "lumzel:"` in the file, and Nodes whose `data-doc-links` name the file (`git grep -n "<file>" -- 'docs/**/*.html'`).
3. Update each Node in place:
   - code exists and tests pass → `done`; partial → `in-progress`
   - behavior now differs from what the Node says → fix the Node text if the change was intended, else mark `drift` and tell the user
   - line numbers moved → fix the `file:line` links
   - a ticket delivers the Node (a `delivers` item has `data-doc-delivers="<design-path>#<node-id>"`) → copy the new status to that item
4. Changed code with no Node: add the Node to the right block, or tell the user it is undocumented.
5. Bump `data-doc-date` on the doc's `<html>` to today.
6. Run `doc check`. Zero problems before you report.

## Scaffold, check, confirm

These are the named operations the skills of this Deck use. A project that has the Lumzel CLI (a `lumzel` script in `package.json`) runs them as `pnpm lumzel …`; every other project does them by hand, as written here. Check for the script once per Session.

| Operation | With the CLI | By hand |
|---|---|---|
| `scaffold design <id>` | `pnpm lumzel new <id>` | copy `scaffolds/design.html` (beside this file) to `docs/features/<id>/design.html` |
| `scaffold ticket <doc-id> <NN-slug>` | `pnpm lumzel ticket <doc-id> <NN-slug>` | copy `scaffolds/ticket.html` to `docs/features/<doc-id>/tickets/<NN-slug>.html` |
| `scaffold adr <NNNN-slug>` | `pnpm lumzel adr <NNNN-slug>` | copy `scaffolds/adr.html` to `docs/adr/<NNNN-slug>.html` |
| `scaffold result <id>` | `pnpm lumzel result <id>` | copy `scaffolds/result.html` to `docs/results/<id>.html` |
| `doc check [file]` | `pnpm lumzel check [file]` | the checklist below |
| `doc trace <feature>` | `pnpm lumzel trace <feature>` | read each ticket's `delivers` block and the design doc's `tickets` checklist |
| `doc confirm <id>` | `pnpm lumzel confirm <id>` | set `data-doc-status="confirmed"` on the design doc's `<html>`, only when every decision has `data-doc-answer` |

After copying a scaffold by hand: set `data-doc-id` (design: `<id>`; ticket: `<doc-id>-<NN>`; adr: the slug), `data-doc-date` to today, the `<title>`, the `<h1>` and the id shown in the hero, and replace every `sample` path in it with the real one.

`doc check` by hand, for each doc you touched:

1. `<html>` has `data-doc-id`, `data-doc-type`, `data-doc-status`, `data-doc-date`; the page links no stylesheet and no script.
2. Every `data-doc-node` id is unique in its doc.
3. Every path in `data-doc-links` exists, unless its Node is `planned`. A `<doc>#<node>` link names a Node that exists.
4. Every `lumzel:<doc-id>#<node-id>` tag in code names a Node that exists (`git grep -n "lumzel:"`).
5. A ticket has at least one design block, a `done-when` block and a `delivers` block; each `data-doc-delivers` names a real Node and carries that Node's status.
6. A code-bound Node is delivered by exactly one ticket. `data-doc-blocked-by` has no cycle.
