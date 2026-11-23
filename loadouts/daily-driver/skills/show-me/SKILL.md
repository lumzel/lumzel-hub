---
name: show-me
description: Help the user understand the current topic visually with concise diagrams, code-shape sketches, and focused HTML artifacts.
disable-model-invocation: true
---

Help the user understand the current topic of conversation visually. Skip the preamble and keep prose brief. Pick the smallest view that makes the key point clear.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree, including state and module boundaries that matter:

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

- Use `diff` when the point is what changes and the surrounding shape already exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

For a file-layout change:

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

For a call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
-  navigateToSession
+  navigateToSession
+    subscribeToEvents
```

For a state or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

- For a visual UI, layout, state comparison, or concept too dense for Mermaid, write one self-contained, offline-capable HTML file following Lumzel's visual style and live light/dark theme contract:
  - Include `<meta name="color-scheme" content="light dark" />` and `<meta name="lumzel-theme" content="auto" />` in `<head>`.
  - Define light and dark fallbacks (`:root`, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`, and `:root[data-theme="dark"]`) using Lumzel's semantic CSS tokens (`--shell`, `--canvas`, `--surface`, `--surface-hover`, `--surface-selected`, `--border`, `--border-strong`, `--fg`, `--muted`, `--faint`, `--primary`, `--primary-fg`, `--brand`, `--brand-soft`, `--done`, `--gate`, `--changed`, `--drift`). Never hardcode `#fff`, `#000`, or single-theme hex colors on backgrounds, cards, borders, prose, or inline SVGs (`currentColor` / `var(--...)` only); derive soft tints with `color-mix(in srgb, var(--brand) 14%, transparent)`.
  - Keep typography crisp with Inter / system sans for UI and Geist Mono / monospace for identifiers; avoid external CDN fonts or scripts when pure CSS/inline SVG suffices. If using Mermaid, store raw source in `data-mermaid-src` and re-render on `lumzel:theme-change` and `prefers-color-scheme` changes.
  - When the visual presents choices or follow-up actions, include a lightweight `lumzel:html-reply` postMessage bridge (`lumzel:preview-ping` → `lumzel:preview-host-ready` → `lumzel:html-reply`, with clipboard fallback outside Lumzel).
  - Show the file in Lumzel's built-in file preview (`preview_open`) instead of invoking `open` or launching an external browser.

### guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.
