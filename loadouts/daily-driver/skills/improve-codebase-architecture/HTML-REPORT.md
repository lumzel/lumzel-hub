# HTML Report Format (Lumzel-Native Theme & Interactive Preview)

The architectural review is rendered as a single self-contained HTML file in the OS temp directory and opened in Lumzel's built-in file preview. It adapts automatically to Lumzel's live light/dark theme tokens (falling back to `@media (prefers-color-scheme: dark)` when opened standalone) and lets the user pick a candidate directly via `lumzel:html-reply`.

Mix **Mermaid** (re-rendered dynamically on theme changes) for graph-shaped dependencies with hand-built semantic-token divs and inline SVGs for editorial visuals (mass diagrams, cross-sections, collapse diagrams).

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="lumzel-theme" content="auto" />
    <title>Architecture review for {{repo name}}</title>
    <style>
      :root {
        color-scheme: light dark;
        --font-sans: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
        --font-mono: "Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
        --shell: #f3f3f4;
        --canvas: #fbfbfb;
        --surface: #ffffff;
        --surface-hover: #f4f4f5;
        --surface-selected: #eeeef0;
        --border: #ececef;
        --border-strong: #e4e4e7;
        --fg: #09090b;
        --muted: #64636e;
        --faint: #81818b;
        --primary: #18181b;
        --primary-fg: #fafafa;
        --brand: #0070e3;
        --brand-soft: #eef5ff;
        --done: #1c882d;
        --gate: #d08700;
        --changed: #7f22fe;
        --drift: #e7000b;
        --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          --shell: #0c0c0e;
          --canvas: #111114;
          --surface: #18181b;
          --surface-hover: #27272a;
          --surface-selected: #2d2d31;
          --border: rgba(255, 255, 255, 0.06);
          --border-strong: rgba(255, 255, 255, 0.12);
          --fg: #fafafa;
          --muted: #9f9fa9;
          --faint: #7f7f89;
          --primary: #e4e4e7;
          --primary-fg: #18181b;
          --brand: #4390ee;
          --brand-soft: rgba(67, 144, 238, 0.14);
          --done: #4ade80;
          --gate: #fbbf24;
          --changed: #a78bfa;
          --drift: #f87171;
          --shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --shell: #0c0c0e;
        --canvas: #111114;
        --surface: #18181b;
        --surface-hover: #27272a;
        --surface-selected: #2d2d31;
        --border: rgba(255, 255, 255, 0.06);
        --border-strong: rgba(255, 255, 255, 0.12);
        --fg: #fafafa;
        --muted: #9f9fa9;
        --faint: #7f7f89;
        --primary: #e4e4e7;
        --primary-fg: #18181b;
        --brand: #4390ee;
        --brand-soft: rgba(67, 144, 238, 0.14);
        --done: #4ade80;
        --gate: #fbbf24;
        --changed: #a78bfa;
        --drift: #f87171;
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--canvas);
        color: var(--fg);
        font: 14px/1.6 var(--font-sans);
        -webkit-font-smoothing: antialiased;
      }
      main { max-width: 1080px; margin: 0 auto; padding: 36px 24px 56px; display: grid; gap: 32px; }
      .card {
        background: var(--surface);
        border: 1px solid var(--border-strong);
        border-radius: 10px;
        box-shadow: var(--shadow);
        padding: 20px;
      }
      .badge {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500;
        border: 1px solid var(--border-strong); background: var(--surface-hover); color: var(--fg);
      }
      .badge--strong { background: color-mix(in srgb, var(--done) 14%, transparent); border-color: color-mix(in srgb, var(--done) 35%, transparent); color: var(--done); }
      .badge--worth { background: color-mix(in srgb, var(--gate) 14%, transparent); border-color: color-mix(in srgb, var(--gate) 35%, transparent); color: var(--gate); }
      .badge--spec { background: var(--surface-hover); color: var(--muted); }
      .btn {
        display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
        border-radius: 6px; border: 1px solid var(--border-strong); background: var(--surface);
        color: var(--fg); font: 500 13px/1 var(--font-sans); cursor: pointer;
      }
      .btn:hover { background: var(--surface-hover); border-color: var(--brand); }
      .btn--primary { background: var(--brand); border-color: var(--brand); color: #ffffff; }
      .mono { font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); }
      .diagram-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      @media (max-width: 760px) { .diagram-grid { grid-template-columns: 1fr; } }
      .diagram-box { background: var(--canvas); border: 1px solid var(--border-strong); border-radius: 8px; padding: 14px; overflow-x: auto; }
      .seam { stroke: var(--muted); stroke-dasharray: 4 4; }
      .leak { stroke: var(--drift); stroke-width: 2; }
      .deep { background: color-mix(in srgb, var(--brand) 12%, var(--surface)); border: 2px solid var(--brand); }
      .adr-callout {
        padding: 10px 12px; border-radius: 8px;
        background: color-mix(in srgb, var(--gate) 12%, var(--surface));
        border: 1px solid color-mix(in srgb, var(--gate) 35%, transparent);
        color: var(--fg); font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>...</header>
      <section id="candidates" style="display:grid;gap:24px">...</section>
      <section id="top-recommendation">...</section>
    </main>

    <!-- Lumzel reply bridge (standalone clipboard fallback) -->
    <script>
      (() => {
        let hostCanReply = false;
        const pending = new Map();
        window.addEventListener("message", (event) => {
          const data = event && event.data;
          if (!data || typeof data !== "object") return;
          if (data.type === "lumzel:preview-host-ready" && Array.isArray(data.capabilities)) {
            hostCanReply = data.capabilities.includes("reply");
          }
          if (data.type === "lumzel:html-reply-ack" && data.requestId && pending.has(data.requestId)) {
            const resolve = pending.get(data.requestId);
            pending.delete(data.requestId);
            resolve(data);
          }
        });
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "lumzel:preview-ping" }, "*");
        }
        window.sendToLumzel = async (text, title = document.title) => {
          const payload = String(text || "").trim();
          if (!payload) return { ok: false, status: "empty" };
          if (hostCanReply && window.parent && window.parent !== window) {
            const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return new Promise((resolve) => {
              pending.set(requestId, resolve);
              window.parent.postMessage({ type: "lumzel:html-reply", requestId, title, text: payload }, "*");
            });
          }
          try {
            await navigator.clipboard.writeText(payload);
            return { ok: true, status: "copied" };
          } catch {
            return { ok: false, status: "unavailable" };
          }
        };
      })();
    </script>

    <!-- Optional: only include when the report contains .mermaid blocks -->
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      const blocks = [...document.querySelectorAll(".mermaid")].map((el) => {
        el.dataset.mermaidSrc = el.textContent.trim();
        return el;
      });
      const isDark = () => {
        const attr = document.documentElement.getAttribute("data-theme");
        if (attr === "dark" || attr === "light") return attr === "dark";
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
      };
      async function renderMermaid() {
        if (!blocks.length) return;
        mermaid.initialize({ startOnLoad: false, theme: isDark() ? "dark" : "neutral", securityLevel: "loose" });
        for (const el of blocks) {
          el.removeAttribute("data-processed");
          el.textContent = el.dataset.mermaidSrc;
        }
        await mermaid.run({ nodes: blocks });
      }
      renderMermaid();
      window.addEventListener("lumzel:theme-change", renderMermaid);
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderMermaid);
    </script>
  </body>
</html>
```

## Header

Repo name, date, and a compact legend: solid box = module, dashed line = seam, red arrow (`var(--drift)`) = leakage, brand-framed box = deep module. No introduction paragraph. Straight into the candidates.

## Candidate card

The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms (from the `/codebase-design` skill) without ceremony.

Each candidate is one `<article class="card">`:

- **Title**: short, names the deepening (e.g. "Collapse the Order intake pipeline").
- **Badge row**: recommendation strength (`Strong` = `.badge--strong`, `Worth exploring` = `.badge--worth`, `Speculative` = `.badge--spec`), plus a tag for the dependency category (`in-process`, `local-substitutable`, `ports & adapters`, `mock`).
- **Files**: monospaced list using `.mono`.
- **Before / After diagram**: the centrepiece. Two columns side by side (`.diagram-grid`). See patterns below.
- **Problem**: one sentence. What hurts.
- **Solution**: one sentence. What changes.
- **Wins**: bullets, ≤6 words each. e.g. "Tests hit one interface", "Pricing logic stops leaking", "Delete 4 shallow wrappers".
- **ADR callout** (if applicable): one line in `.adr-callout`.
- **Pick action**: an inline `<button class="btn">` ("Explore this candidate") that calls `sendToLumzel("Let's explore candidate #N: <title> (files: ...)", document.title)` and updates button feedback based on the returned status (`sent` / `queued` / `draft` / `copied`).

No paragraphs of explanation. If the diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

Pick the pattern that fits the candidate. Mix them. Don't make every diagram look the same. Variety is part of the point.

### Mermaid graph (dependencies / call flow)

Use a Mermaid `flowchart` or `graph` when the point is "X calls Y calls Z, and look at the mess." Wrap it in `.diagram-box`. Never hardcode dark-only or light-only background fills in `classDef` — stick to stroke emphasis so both light and dark Mermaid themes stay legible.

```html
<div class="diagram-box">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#e7000b,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### Hand-built boxes-and-arrows (offline-first, works without CDN)

Modules as `<div>`s using `var(--surface)`, `var(--border-strong)`, and `var(--fg)`. Arrows as inline SVG `<line>` or `<path>` using `currentColor`, `var(--muted)`, `var(--brand)`, and `var(--drift)`. Reach for this when you want the "after" diagram to feel like one deep module (`.deep`) with muted internals.

### Cross-section (layered shallowness)

Stack horizontal bands (`border-left: 4px solid var(--border-strong)`) to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band (`border-left-color: var(--brand)`) labelled with the consolidated responsibility.

### Mass diagram ("interface as wide as implementation")

Two rectangles per module: one for interface surface area, one for implementation. Before: interface rectangle is nearly as tall as the implementation rectangle (shallow). After: interface rectangle is short, implementation rectangle is tall (deep).

### Call-graph collapse

Before: a tree of function calls rendered as nested boxes. After: the same tree collapsed into one `.deep` box, with the now-internal calls shown muted inside it.

## Style guidance

- Follow Lumzel's calm-chrome design language: zinc neutrals carry structure; `--brand` signals focus/deepened target; `--done` / `--gate` / `--drift` signal status only.
- **No single-theme hardcoding**: never write `#fff`, `#000`, `bg-white`, `bg-stone-50`, or `text-slate-900` directly. Always route colors through the semantic tokens above and `color-mix(in srgb, ...)` tints.
- Prefer pure CSS over CDN frameworks so the report renders cleanly offline in Lumzel's file preview (only load Mermaid ESM if the page actually uses `.mermaid` blocks).
- Keep diagrams ~320px tall so before/after sits comfortably side by side without scrolling.
- Use uppercase mono labels (`font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase`) for schematic module tags.

## Top recommendation section

One `.card` framed with `border-color: var(--brand)`. Candidate name, one sentence on why, anchor link to its card, and a `.btn--primary` button to explore it directly.

## Tone

Plain English, concise, and grounded in the `/codebase-design` vocabulary. Concision is not an excuse to drift.

**Use exactly:** module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality.

**Never substitute:** component, service, unit (for module) · API, signature (for interface) · boundary (for seam) · layer, wrapper (for module, when you mean module).

**Phrasings that fit the style:**

- "Order intake module is shallow: interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen: one interface, one place to test."
- "Two adapters justify the seam: HTTP in prod, in-memory in tests."

**Wins bullets** name the gain in glossary terms: *"locality: bugs concentrate in one module"*, *"leverage: one interface, N call sites"*, *"interface shrinks; implementation absorbs the wrappers"*. Don't write *"easier to maintain"* or *"cleaner code"*.

No hedging, no throat-clearing, no "it's worth noting that…". If a sentence could be a bullet, make it a bullet. If a bullet could be cut, cut it.
