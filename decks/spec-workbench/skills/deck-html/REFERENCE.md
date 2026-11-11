# HTML doc reference

A Visual Doc is one self-contained HTML page. Meaning lives only in `data-doc-*` attributes; `doc check <file>` validates them and Lumzel builds the Trace from them. The look comes only from the classes in this Deck's `runtime/doc.css`, which the Deck adds when it shows the page. Every example below is the canonical markup, the same the scaffolds hold. Copy it, keep the class names, and follow the style rules and page recipes above.

## Paths

| Doc | Path | `<rel>` to repo root |
|---|---|---|
| design | `docs/features/<id>/design.html` | `../../..` |
| ticket | `docs/features/<id>/tickets/NN-slug.html` | `../../../..` |
| ADR | `docs/adr/NNNN-slug.html` | `../..` |
| local answer | `docs/results/<id>.html` (gitignored) | `../..` |

Links inside `.meta` are relative to the doc: `<rel>/<path>`.

## Page shell

```html
<!doctype html>
<html lang="zh" data-doc-id="invoice-cache" data-doc-type="design" data-doc-status="draft" data-doc-date="2026-10-28">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>发票读取缓存</title>
</head>
<body>
<main class="lumzel-doc">
<div class="lumzel-hero"><div class="pills"><span class="pill kind">design</span><span class="pill s-draft">draft</span><span class="pill">2026-10-28</span><code class="docid">invoice-cache</code></div>
<h1>发票读取缓存</h1></div>
<header class="summary" data-doc-summary>一句话：这份文档回答什么。</header>

<!-- blocks -->

</main>
</body>
</html>
```

- `data-doc-id`: the doc id (folder name for designs, `NN-slug` for tickets, `NNNN-slug` for ADRs).
- `data-doc-type`: `design` | `ticket` | `adr` | `result`. `data-doc-status`: `draft` | `confirmed` (set by `doc confirm <id>`, never by hand). `data-doc-date`: `YYYY-MM-DD`, bump on every edit. Keep the hero pills in step with these.
- No `<link>`, no `<style>`, no `<script src>`, no external resources: the Deck styles the page when it shows it.

## Blocks

```html
<section class="lumzel-block" id="<id>" data-doc-block="<id>" data-doc-kind="<kind>">
<h2>标题</h2>
<p class="lead" data-doc-lead>可选，一行。</p>
<!-- body -->
</section>
```

Block ids are unique in the doc.

| Kind | Answers | Body root |
|---|---|---|
| `kpi` | how big, at a glance? | `.kpi > .card` |
| `flow` | what happens, in order? where are the human gates? | `ol.flow > li.card.step` |
| `architecture` | which parts, who talks to whom? | `.card.arch > .layer`, `ul.edges` |
| `sequence` | who calls whom, step by step? | `.card.seq > svg` |
| `er` | what is stored? | `.er > .card.tbl` |
| `api-table` | what is the contract? | `table.grid` with `.method` |
| `checklist` | what is left, what blocks what? | `.check > .card.item` |
| `decisions` | what was chosen, what is still open? | `.dec > .card.d` |
| `table` | anything tabular (risks, tests, comparisons) | `table.grid` |
| `callout` | the one thing not to miss | `.callout.<tone>` |
| `chart` | how do numbers compare? | `.card.chart > .chart-bars` |

## Nodes

Any element with `data-doc-node="<id>"` is a Node, addressed as `<doc-id>#<node-id>`.

| Attribute | Means |
|---|---|
| `data-doc-status` | `planned` `in-progress` `done` `changed` `drift` `dropped` |
| `data-doc-links` | space-separated targets: `path`, `path:24`, `path:24-60`, `table:invoices`, `test:tests/a.test.ts`, `url:https://…`, `docs/features/x/design.html#node`, `docs/adr/0003-x.html` |
| `data-doc-note` | short note (test seam, failure cause, which test proves it) |
| `data-doc-label` | on a child: the Node's name (what the drawer shows) |
| `data-doc-gate` | flow step is a human checkpoint |
| `data-doc-ticket` | checklist row: the ticket path it tracks |
| `data-doc-blocked-by` | checklist row: `a,b` row ids that must be done first |
| `data-doc-delivers` | ticket `delivers` row: `docs/features/<doc>/design.html#<node>` |
| `data-doc-answer` / `data-doc-recommend` / `data-doc-depends` / `data-doc-adr` | decision row: settled answer, recommendation, parent decision ids (`a,b`), ADR path |

The status shows three times, and all three must agree: `data-doc-status="done"`, class `st st-done` on the card, and `<span class="pill s-done">done</span>` inside it.

Code tags stay `lumzel:<doc-id>#<node-id>`. Clicking a Node in the drawer sends a Context pack whose `src` is this `.html` file.

### Link chips

Under a Node's text, one `.meta` line with a chip per link; `table:` links are `code`, the rest are `a`:

```html
<div class="meta"><a class="lk" href="../../../src/services/cache.ts">src/services/cache.ts</a> <code class="lk">table:invoices</code><div class="note">test:tests/cache.test.ts 命中</div></div>
```

## One example per kind

### kpi

```html
<div class="kpi">
  <div class="card"><div class="label">Node</div><div class="value">6</div><div class="note">4 planned · 2 done</div></div>
  <div class="card"><div class="label">接口</div><div class="value">2</div></div>
</div>
```

### flow

```html
<ol class="flow">
  <li class="card step st st-planned" data-doc-node="read" data-doc-status="planned" data-doc-links="src/services/cache.ts">
    <div class="n">01 <span class="pill s-planned">planned</span></div><div class="t" data-doc-label>读缓存</div><div class="s">先查 Redis</div>
    <div class="meta"><a class="lk" href="../../../src/services/cache.ts">src/services/cache.ts</a></div>
  </li>
  <li class="card step gate st" data-doc-node="confirm" data-doc-gate>
    <div class="n">02</div><div class="t" data-doc-label>确认方案</div>
  </li>
</ol>
```

### architecture

One `.layer` per tier; edges in `ul.edges`, each naming both Node ids.

```html
<div class="card arch">
  <div class="layer" data-doc-layer="解析包"><div class="layer-label">解析包</div><div class="nodes">
    <div class="card node st st-planned" data-doc-node="extract" data-doc-status="planned" data-doc-links="apps/desktop/src/deck/docModel/html.js test:apps/desktop/tests/docModel/html.test.js">
      <div class="t"><span data-doc-label>extractDoc()</span> <span class="pill s-planned">planned</span></div><div class="s">HTML → doc IR</div>
    </div>
  </div></div>
  <div class="layer" data-doc-layer="App"><div class="layer-label">App</div><div class="nodes">
    <div class="card node st st-changed" data-doc-node="deck" data-doc-status="changed" data-doc-links="apps/desktop/src/deck/DeckView.tsx">
      <div class="t"><span data-doc-label>方案工作台 Deck</span> <span class="pill s-changed">changed</span></div>
    </div>
  </div></div>
  <ul class="edges"><li data-doc-from="extract" data-doc-to="deck"><span>extractDoc()</span> <i>→</i> <span>方案工作台 Deck</span> <em data-doc-label>doc IR</em></li></ul>
</div>
```

### sequence

Inline SVG. Actors 320px apart (`x = 160, 480, 800…`), messages 40px apart from `y = 70`. Replies add class `reply` (dashed).

```html
<div class="card seq"><svg viewBox="0 0 640 156" preserveAspectRatio="xMinYMin meet" role="img">
  <defs><marker id="sq-pick" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="head"/></marker></defs>
  <line class="life" x1="160" y1="46" x2="160" y2="148"/><g class="actor" data-doc-actor data-doc-id="user"><rect x="90" y="8" width="140" height="30" rx="7"/><text x="160" y="28" text-anchor="middle">用户</text></g>
  <line class="life" x1="480" y1="46" x2="480" y2="148"/><g class="actor" data-doc-actor data-doc-id="lumzel"><rect x="410" y="8" width="140" height="30" rx="7"/><text x="480" y="28" text-anchor="middle">Lumzel</text></g>
  <g class="msg st-done" data-doc-node="pick-msg" data-doc-status="done" data-doc-from="user" data-doc-to="lumzel"><line x1="160" y1="70" x2="478" y2="70" marker-end="url(#sq-pick)"/><text x="320" y="64" text-anchor="middle"><tspan class="idx">1. </tspan><tspan data-doc-label>点 Node</tspan></text></g>
  <g class="msg reply" data-doc-node="pack" data-doc-from="lumzel" data-doc-to="user" data-doc-reply><line x1="480" y1="110" x2="162" y2="110" marker-end="url(#sq-pick)"/><text x="320" y="104" text-anchor="middle"><tspan class="idx">2. </tspan><tspan data-doc-label>Context pack</tspan></text></g>
</svg></div>
```

### er

```html
<div class="er">
  <div class="card tbl st st-done" data-doc-node="links-table" data-doc-status="done" data-doc-links="table:links">
    <header><span data-doc-label>links</span> <span class="pill s-done">done</span></header>
    <div class="f"><span class="k">PK</span><span>node</span><span class="ty">text</span></div>
    <div class="f"><span class="k">FK</span><span>doc</span><span class="ty">text</span><span class="fk">→ docs.path</span></div>
  </div>
</div>
```

### api-table

```html
<table class="grid"><thead><tr><th>接口</th><th>说明</th><th>鉴权</th><th>状态</th></tr></thead><tbody>
<tr class="st st-planned" data-doc-node="get-invoice" data-doc-status="planned" data-doc-links="src/api/invoice.ts">
  <td data-doc-label><span class="method">GET</span> <code>/invoices/:id</code></td><td>读发票，命中缓存</td><td>local</td><td><span class="pill s-planned">planned</span></td></tr>
</tbody></table>
```

### checklist (design `tickets`)

```html
<div class="check">
  <div class="card item st st-done" data-doc-node="t01" data-doc-status="done" data-doc-ticket="docs/features/invoice-cache/tickets/01-read-path.html" data-doc-links="docs/features/invoice-cache/tickets/01-read-path.html">
    <span class="box"></span><div><span data-doc-label>01 读路径</span><div class="meta"><a class="mono" href="tickets/01-read-path.html">docs/features/invoice-cache/tickets/01-read-path.html</a></div></div><span class="pill s-done">done</span></div>
  <div class="card item st st-planned" data-doc-node="t02" data-doc-status="planned" data-doc-ticket="docs/features/invoice-cache/tickets/02-evict.html" data-doc-links="docs/features/invoice-cache/tickets/02-evict.html" data-doc-blocked-by="t01">
    <span class="box"></span><div><span data-doc-label>02 失效</span><div class="meta">blocked by t01</div></div><span class="pill s-planned">planned</span></div>
</div>
```

A design doc may also carry a `previews` checklist (`prototype`, `frontend` items linking their paths).

### ticket `delivers` and `done-when`

Same `.check` markup:

```html
<div class="card item st st-in-progress" data-doc-node="n-read" data-doc-status="in-progress" data-doc-delivers="docs/features/invoice-cache/design.html#read"><span class="box"></span><div><span data-doc-label>读缓存</span></div><span class="pill s-in-progress">in-progress</span></div>
<div class="card item st st-done" data-doc-node="dw-hit" data-doc-status="done" data-doc-note="test:tests/cache.test.ts 命中"><span class="box"></span><div><span data-doc-label>命中时不查库</span><div class="meta"><div class="note">test:tests/cache.test.ts 命中</div></div></div><span class="pill s-done">done</span></div>
```

A ticket holds at least one design block (`architecture` `slice`, `sequence` `seq`, `api-table` `contracts`, `decisions` `choices`, `table` `tests`) before these.

### decisions

An item without `data-doc-answer` is open: add class `open`, mark `❓`, the recommended option `.opt.rec`. Indent children 28px per `data-doc-depends` level.

```html
<div class="dec">
  <div class="card d st" data-doc-node="store" data-doc-answer="Redis" data-doc-recommend="Redis" data-doc-adr="docs/adr/0009-cache-store.html" style="margin-left:0px">
    <div class="q">✓ <span data-doc-label>缓存放哪？</span></div>
    <div class="opts"><span class="opt chosen">Redis</span><span class="opt">进程内</span></div>
    <div class="a">→ Redis</div><div class="why">为什么：多实例共享。</div>
    <div class="why">ADR: <a class="mono" href="../../adr/0009-cache-store.html">docs/adr/0009-cache-store.html</a></div>
  </div>
  <div class="card d open st" data-doc-node="ttl" data-doc-recommend="10 分钟" data-doc-depends="store" style="margin-left:28px">
    <div class="q">❓ <span data-doc-label>TTL 多长？</span></div>
    <div class="opts"><span class="opt">1 分钟</span><span class="opt rec">10 分钟</span><span class="opt">60 分钟</span></div>
    <div class="a">推荐：10 分钟</div>
  </div>
</div>
```

### table

```html
<table class="grid"><thead><tr><th>风险</th><th>可能性</th><th>影响</th><th>应对</th></tr></thead><tbody>
<tr data-doc-node="r-stale"><td>缓存脏读</td><td>中</td><td>高</td><td>写后删除</td></tr>
</tbody></table>
```

### callout

Tones: `ok` conclusion, `info` context, `warn` caution, `risk` what can go wrong.

```html
<div class="callout risk">写路径若漏删缓存，用户会看到旧金额。</div>
```

### chart

Bars only; height is `value / max × 160` px. Label the unit in the bar text.

```html
<div class="card chart"><div class="chart-bars">
  <div class="chart-bar" style="height:160px;--bar:var(--brand)" title="before"><span>120 ms</span><small>before</small></div>
  <div class="chart-bar" style="height:24px;--bar:var(--done)" title="after"><span>18 ms</span><small>after</small></div>
</div></div>
```

### ADR

`data-doc-type="adr"`, blocks `context`, `decision`, `consequences` (the adr recipe). A decision row elsewhere points at it with `data-doc-adr`.
