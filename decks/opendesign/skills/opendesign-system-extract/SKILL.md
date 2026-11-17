---
name: opendesign-system-extract
description: Extract or author a portable DESIGN.md brand contract and tokens.css stylesheet from a live website, local codebase, or design brief.
---

# OpenDesign System Extractor

Produce a versionable design system package in the target directory containing:
1. `DESIGN.md` — Human- and agent-readable brand contract.
2. `tokens.css` — Drop-in CSS custom properties matching the OpenDesign `--od-*` token schema.

## Required `tokens.css` Variables

Define all of the following under `:root` (and optionally `:root[data-theme="dark"]` if dark mode is specified):

```css
:root {
  --od-bg: #...;
  --od-surface: #...;
  --od-surface-2: #...;
  --od-fg: #...;
  --od-muted: #...;
  --od-accent: #...;
  --od-accent-fg: #...;
  --od-border: #...;
  --od-radius: 8px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  --od-font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
```

## Required `DESIGN.md` Sections

Write clear, opinionated, concrete rules (no vague adjectives like "modern and clean"):
1. **Atmosphere & Brand Voice**: Exact mood, density, and copy tone.
2. **Color Palette & Surface Hierarchy**: Hex values, semantic roles, contrast expectations.
3. **Typography & Scale**: Font stacks, heading weights, tabular numbers, tracking/leading.
4. **Spacing, Radius & Elevation**: Base grid, corner radii, border-vs-shadow discipline.
5. **Core Components**: Buttons, cards, inputs, tables, badges, empty states.
6. **Anti-Patterns (Do Not Do)**: 4–6 explicit visual mistakes to avoid for this brand.

When extracting from a codebase, explore the current working directory and target path autonomously to inspect existing UI and styling tokens before authoring `DESIGN.md` and `tokens.css`.
