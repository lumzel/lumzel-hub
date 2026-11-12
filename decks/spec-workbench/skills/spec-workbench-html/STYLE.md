# Visual Doc style

One look for every Visual Doc, whichever Agent writes it. The style is **quiet engineering doc** (the Linear / Vercel Geist family): neutral zinc greys, hairline borders, one brand blue, mono for anything that is an address. It is the same system as Lumzel's own UI (`DESIGN.md`), so a doc in the 方案工作台 Deck reads as part of the app.

Why this one and not another common HTML style:

| Style | Fit for Lumzel | Why |
|---|---|---|
| **Quiet engineering (Linear / Vercel)** | chosen | Dense data, status colours carry meaning, works light and dark, matches the app |
| GitHub Primer docs | close | Same density, but blue-heavy chrome fights the status colours |
| Notion / docs prose | no | Built for long prose; Visual Docs are blocks, not paragraphs |
| Stripe / editorial | no | Large display type and whitespace waste the drawer width |
| Bold / distinctive landing page | no | Every doc would look different, which is what this file exists to stop |

## Rules

1. **Never write CSS in a doc.** Every look comes from this Deck's `runtime/doc.css`. No `<style>`, no hex colour, no web font. The only inline styles allowed are `margin-left` on nested decisions and `height` / `--bar` on chart bars.
2. **Copy, don't invent.** Start from a page recipe below and the markup in the reference; keep its class names. A block kind always has the same markup (REFERENCE.md); a new class name is a bug.
3. **Status is the only colour.** Grey planned, blue in-progress, green done, amber gate, violet changed, red drift. Shown as a pill (dot + word) and a 3px left rule on the card. Never colour text for emphasis; use `<b>`.
4. **Mono for addresses.** Ids, paths, `file:line`, HTTP methods, table names: `<code>` or `.lk`. People-readable labels stay sans.
5. **Lead with shape.** The first block is `kpi`, `flow` or `architecture`; the `summary` above it is one sentence a reader can act on.
6. **One idea per block, ≤ 7 items.** More than 7 cards in a block: split it or make it a `table`.
7. **Short words.** Titles ≤ 12 Chinese characters or 6 English words. Card title ≤ 1 line, sub ≤ 1 line. Detail lives in `data-doc-note` or the linked code, not in the card.
8. **Light and dark.** Do nothing: tokens switch with `data-theme`. Inline SVG uses `currentColor` or `var(--…)`, never a fixed fill.

## Page anatomy

```
.lumzel-doc                      max 1080px, 40/48px padding, canvas background
  .lumzel-hero                   pills: TYPE · status · date · doc id (mono)
    h1                         24/32, 600
  header.summary               15/22 muted, one sentence
  section.lumzel-block × n       40px apart
    h2                         18/28, 600
    p.lead (optional)          one line, muted
    <block body>               cards on surface, 1px border, 8px radius
```

## Page recipes

Pick by the question the reader asks. Scaffold with the CLI (it gets the path and the `<rel>` right), then write these blocks, in this order, between the `summary` and `</main>`, using the markup in the reference below.

| Recipe | Reader asks | Blocks, in order | Scaffold |
|---|---|---|---|
| answer | how does X work? why? | callout `answer` → architecture or flow → table `evidence` → checklist `next` | `scaffold result <id>` |
| compare | A or B? | table `options` → decisions → callout risk | `scaffold result <id>` |
| review | is this change OK? | kpi `scope` → checklist per Node or axis → table `findings` | `scaffold result review-<x>` |
| design | what will we build? | kpi → flow (gates) → architecture → api-table → er → decisions → callout risk | `scaffold design <id>` |
| adr | what did we decide, for good? | callout `context` → decisions `decision` → table `consequences` | `scaffold adr <NNNN-slug>` |

Tickets use the scaffold from `scaffold ticket` as is; its blocks already follow this style. Each recipe has a rendered sample in this skill's `templates/<recipe>.html`.

## Tone of words

- Status pills use the status word as is (`done`, `planned`); severity pills reuse status classes: `blocker` → `s-drift`, `major` → `s-draft`, `minor` → `s-planned`.
- Decisions: `❓` open, `✓` answered. Recommendation in `.opt.rec`, chosen in `.opt.chosen`, reason in `.why` starting `为什么：`.
- Callout tones: `ok` conclusion, `info` context, `warn` caution, `risk` the one thing that can go wrong.
