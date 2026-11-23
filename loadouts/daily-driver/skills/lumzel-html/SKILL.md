---
name: lumzel-html
description: "Author standalone HTML pages (reports, architecture visuals, diagrams, interactive explainers) that automatically adapt to Lumzel's live light/dark theme tokens and support sending user selections or feedback directly back to the active Lumzel Session."
---

# Lumzel HTML: Theme-Adaptive & Interactive Standalone Pages

Apply this contract whenever you author a standalone HTML page directly (reports, architecture visuals, diagrams, or interactive decision pages) intended for preview in Lumzel. Do not modify or override external CLI tools that manage their own HTML build pipeline.

## 1. Automatic Lumzel Theme Adaptation

Lumzel's built-in File Preview only syncs workbench theme tokens into HTML documents that **explicitly opt in** (so third-party pages, fixed-palette prototypes, or pages with their own `data-theme` / CSS variables are never overwritten):

- Opt in by adding `<meta name="lumzel-theme" content="auto" />` in `<head>` (or `<html data-lumzel-theme>`).
- Once opted in, Lumzel sets `<html data-theme="light|dark">`, sets `color-scheme`, writes Lumzel's semantic CSS custom properties onto `<html>` inline styles on load and on live theme/preset/accent switches, and dispatches `window.dispatchEvent(new CustomEvent('lumzel:theme-change', { detail: { theme, presetId, tokens } }))`.
- Outside Lumzel (e.g., opened directly in a system browser), pages fall back seamlessly to `@media (prefers-color-scheme: dark)`.

### Required CSS Token Scaffold

Include both `<meta name="color-scheme" content="light dark" />` and `<meta name="lumzel-theme" content="auto" />` in `<head>`, and define light/dark fallbacks using Lumzel's exact semantic token names:

```css
:root {
  color-scheme: light dark;
  --shell: #f5f5f4;
  --canvas: #fafaf9;
  --surface: #ffffff;
  --surface-hover: #f4f4f5;
  --surface-selected: #eceef2;
  --border: rgba(15, 23, 42, 0.12);
  --border-strong: rgba(15, 23, 42, 0.22);
  --fg: #0f172a;
  --muted: #475569;
  --faint: #64748b;
  --primary: #2563eb;
  --primary-fg: #ffffff;
  --brand: #2563eb;
  --brand-soft: rgba(37, 99, 235, 0.12);
  --done: #16a34a;
  --gate: #d97706;
  --changed: #2563eb;
  --drift: #dc2626;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --shell: #141416;
    --canvas: #18181b;
    --surface: #202024;
    --surface-hover: #27272c;
    --surface-selected: #2e2e36;
    --border: rgba(244, 244, 245, 0.12);
    --border-strong: rgba(244, 244, 245, 0.22);
    --fg: #f4f4f5;
    --muted: #a1a1aa;
    --faint: #71717a;
    --primary: #60a5fa;
    --primary-fg: #0b1220;
    --brand: #60a5fa;
    --brand-soft: rgba(96, 165, 250, 0.16);
    --done: #4ade80;
    --gate: #fbbf24;
    --changed: #60a5fa;
    --drift: #f87171;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --shell: #141416;
  --canvas: #18181b;
  --surface: #202024;
  --surface-hover: #27272c;
  --surface-selected: #2e2e36;
  --border: rgba(244, 244, 245, 0.12);
  --border-strong: rgba(244, 244, 245, 0.22);
  --fg: #f4f4f5;
  --muted: #a1a1aa;
  --faint: #71717a;
  --primary: #60a5fa;
  --primary-fg: #0b1220;
  --brand: #60a5fa;
  --brand-soft: rgba(96, 165, 250, 0.16);
  --done: #4ade80;
  --gate: #fbbf24;
  --changed: #60a5fa;
  --drift: #f87171;
}

body {
  background: var(--canvas);
  color: var(--fg);
}
```

### Styling Rules

1. **No single-theme hardcoding**: Never hardcode `#fff`, `#000`, `bg-white`, `bg-stone-50`, or `text-slate-900` on page backgrounds, cards, borders, or prose without mapping through CSS variables (`var(--canvas)`, `var(--surface)`, `var(--border)`, `var(--fg)`, `var(--muted)`) or matching `dark:` variants.
2. **Soft tints from semantic tokens**: Derive badge fills, callouts, and highlights with `color-mix(in srgb, var(--done) 14%, transparent)` (or `--gate`, `--drift`, `--brand`) so they stay legible on both light and dark surfaces and follow Lumzel's accent color.
3. **Inline SVGs**: Use `currentColor`, `var(--fg)`, `var(--muted)`, `var(--border-strong)`, `var(--brand)`, and `var(--drift)` for strokes and fills — never bare dark ink hexes that vanish on dark backgrounds.
4. **Tailwind CDN (when used)**: Bind utility classes to the tokens above (`bg-[var(--surface)]`, `border-[var(--border)]`, `text-[var(--fg)]`), and place `tailwind.config` **after** loading `cdn.tailwindcss.com` (putting it before gets overwritten by the CDN script):
   ```html
   <script src="https://cdn.tailwindcss.com"></script>
   <script>
     tailwind.config = { darkMode: ['selector', '[data-theme="dark"]'] };
     const mq = window.matchMedia("(prefers-color-scheme: dark)");
     const syncStandaloneTheme = () => {
       if (!document.documentElement.hasAttribute("data-theme") && mq.matches) {
         document.documentElement.setAttribute("data-theme", "dark");
       }
     };
     syncStandaloneTheme();
     mq.addEventListener("change", () => {
       if (window.parent === window) document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
     });
   </script>
   ```
5. **Mermaid diagrams**: Store each diagram's original Mermaid source in `data-mermaid-src` and re-render on both initial load and `lumzel:theme-change` (plus `prefers-color-scheme` changes when standalone):
   ```html
   <script type="module">
     import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
     const blocks = [...document.querySelectorAll(".mermaid")].map((el) => {
       const src = el.textContent.trim();
       el.dataset.mermaidSrc = src;
       return el;
     });
     const isDark = () => {
       const attr = document.documentElement.getAttribute("data-theme");
       if (attr === "dark" || attr === "light") return attr === "dark";
       return window.matchMedia("(prefers-color-scheme: dark)").matches;
     };
     async function renderMermaid() {
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
   ```

## 2. HTML-to-Agent Interaction Protocol (`lumzel:html-reply`)

When a generated HTML page presents choices, candidates, review findings, or feedback inputs (for example, choosing a candidate to grill in `improve-codebase-architecture` or confirming design decisions), include a lightweight action button or reply bar that sends the user's structured selection back to the opening Lumzel Session.

### Protocol

1. **Detect Lumzel host**: Send `{ type: 'lumzel:preview-ping' }` to `window.parent`. Lumzel responds with `{ type: 'lumzel:preview-host-ready', capabilities: ['reply', 'theme'], theme, presetId, tokens }`.
2. **Send reply**: Post `{ type: 'lumzel:html-reply', requestId, title, text }` to `window.parent`. Lumzel opens its native confirmation dialog bound to the originating Session (allowing the user to review/edit, send, queue, or insert into composer).
3. **Handle acknowledgement**: Listen for `{ type: 'lumzel:html-reply-ack', requestId, ok, status }` where `status` is `'sent' | 'queued' | 'draft' | 'cancelled' | 'unavailable'`.
4. **Standalone browser fallback**: If `hostCanReply` is false (the file was opened outside Lumzel), copy `text` to the clipboard and show brief feedback.

### Reusable Helper Snippet

```html
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
```

### When to Add Interactive Controls

- **Candidate / option cards**: Add an inline action button on each card (e.g. "Explore this candidate") that calls `sendToLumzel(...)` with a concise prompt naming the chosen option and relevant files.
- **Decision / review pages**: Include a compact floating or bottom action bar that summarizes checked choices and notes, calling `sendToLumzel(summary, document.title)` and updating button text based on the returned `status` (`sent` / `queued` / `draft` / `copied`).
- **Purely informational diagrams**: Keep the page clean and skip reply controls unless there is a clear follow-up action the user might take.
