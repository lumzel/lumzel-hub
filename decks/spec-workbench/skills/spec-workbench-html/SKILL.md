---
name: spec-workbench-html
description: Write feature designs and tickets as self-contained HTML Visual Docs that the 方案工作台 Deck shows, instead of Markdown. Never generate docs/results/ files.
---

# HTML doc

Agents produce text faster than humans read it. A Visual Doc moves the reading cost onto the layout: the human sees the shape first, then drills into a Node. When the project has a `GLOSSARY.md`, use its terms.

A Visual Doc is one self-contained HTML page. Layout is HTML and inline SVG styled only by this Deck's runtime; **meaning lives only in `data-doc-*` attributes**, which Lumzel reads to build the Feature list, the ticket board and the Trace. [STYLE.md](STYLE.md) is the look: one design language and page recipes. [REFERENCE.md](REFERENCE.md) is the contract: page shell, every attribute, the canonical markup of each block kind. Read both before writing a block you have not written this session.

Do **not** generate `docs/results/` files; this workbench only manages feature designs (`docs/features/<id>/design.html`), tickets (`docs/features/<id>/tickets/<NN-slug>.html`), and prototypes (`docs/features/<id>/prototype.html`).

## Write the doc

1. Pick the file and scaffold it (see **Scaffold, check, confirm** below).
   - Feature design: `docs/features/<id>/design.html` by copying `scaffolds/design.html` (beside this file).
   - Ticket of a design doc: `docs/features/<doc-id>/tickets/<NN-slug>.html` by copying `scaffolds/ticket.html`.
   - Prototype (plain clickable HTML, not a Visual Doc): `docs/features/<id>/prototype.html`.
2. Edit the scaffold in place. Keep the `<html data-doc-*>` attributes and the hero. The page links no stylesheet and no script: this Deck adds its own (`runtime/doc.css`, `runtime/doc.js`) when it shows the doc, so the doc reads styled inside Lumzel and as plain HTML anywhere else.
3. Pick the page recipe (`design` in [STYLE.md](STYLE.md), or the ticket scaffold) and write its blocks in order.
4. Copy each block's markup from [REFERENCE.md](REFERENCE.md) with its class names. The look comes only from this Deck's `runtime/doc.css`: no `<link>`, no `<style>`, no hex colours, no fonts, CDNs or images by URL.
5. Give every Node a stable kebab-case `data-doc-node` id, unique in the doc. Ids are addresses (`<doc>#<node>`): never rename one that code already tags.
6. Every Node that is or will be code carries `data-doc-links`. `planned` Nodes may link to files that do not exist yet.
7. Run `doc check [file]` (`pnpm lumzel check [file]` if the project has a `lumzel` script, otherwise follow the checklist below) and fix what it finds.
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
   - `src` is a doc `.html` under `docs/`: the pack points at a Node. Edit that element in place. The Node ref is unchanged by an edit to its text or other `data-doc-*` attributes; a rename is a new address, so do not rename an id that code tags.
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
   - a ticket delivers the Node (a `delivers` item has `data-doc-links="<design-path>#<node-id>"`) → copy the new status to that item
4. Changed code with no Node: add the Node to the right block, or tell the user it is undocumented.
5. Bump `data-doc-date` on the doc's `<html>` to today.
6. Run `doc check`. Zero problems before you report.

## Scaffold, check, confirm

Lumzel only provides `pnpm lumzel check [file]` when a project has a `lumzel` script in `package.json`; scaffolding, confirming, and tracing work directly on HTML files and attributes as shown here:

| Operation | How |
|---|---|
| `scaffold design <id>` | copy `scaffolds/design.html` (beside this file) to `docs/features/<id>/design.html` |
| `scaffold ticket <doc-id> <NN-slug>` | copy `scaffolds/ticket.html` (beside this file) to `docs/features/<doc-id>/tickets/<NN-slug>.html` |
| `doc check [file]` | run `pnpm lumzel check [file]` if `package.json` defines `lumzel`, otherwise run the manual checklist below |
| `doc confirm <id>` | set `data-doc-status="confirmed"` on `design.html`'s `<html>` and hero `<span class="pill s-confirmed">confirmed</span>` (only when every `decisions` item has `data-doc-answer`) |
| Trace | derived automatically by Lumzel from ticket `#delivers` (`data-doc-links`) and `design.html` `#tickets` (`data-doc-ticket`, `data-doc-blocked-by`) |

After copying a scaffold: set `data-doc-id` (design: `<id>`; ticket: `<doc-id>-<NN>`), `data-doc-date` to today, the `<title>`, the `<h1>` and the `.docid` shown in the hero, and replace every `sample` path in it with the real one.

`doc check` checklist, for each doc you touched:

1. `<html>` has `data-doc-id`, `data-doc-type`, `data-doc-status`, `data-doc-date`; the page links no stylesheet and no script.
2. Every `data-doc-node` id is unique in its doc.
3. Every path in `data-doc-links` exists, unless its Node is `planned`. A `<doc>#<node>` link names a Node that exists.
4. Every `lumzel:<doc-id>#<node-id>` tag in code names a Node that exists (`git grep -n "lumzel:"`).
5. A ticket has at least one design block, a `done-when` block and a `delivers` block; each `#delivers` item uses `data-doc-links="<designPath>#<nodeId>"` naming a real Node in `design.html` and carries that Node's status.
6. A code-bound Node is delivered by exactly one ticket when tickets exist. `data-doc-blocked-by` has no cycle.
