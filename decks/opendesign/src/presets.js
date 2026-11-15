// Curated preset Design Systems (DESIGN.md + tokens.css) inspired by OpenDesign.

export const PRESET_SYSTEMS = [
  {
    slug: 'editorial-slate',
    name: 'Editorial Slate',
    tagline: 'Swiss studio light clarity — crisp 1px borders, cobalt focal accent, tabular telemetry.',
    builtin: true,
    swatches: ['#fbfbfb', '#ffffff', '#09090b', '#0070e3', '#e4e4e7'],
    designMd: `# Editorial Slate — DESIGN.md

## Atmosphere & Voice
- Swiss editorial product workspace: quiet, high-clarity, hairline borders instead of heavy shadows.
- Copy is crisp, factual, and direct; avoid promotional superlatives and decorative filler.

## Color Palette
- Canvas (\`--od-bg\`): \`#fbfbfb\`
- Primary Surface (\`--od-surface\`): \`#ffffff\`
- Elevated / Subtle Tint (\`--od-surface-2\`): \`#f4f4f5\`
- Ink (\`--od-fg\`): \`#09090b\`
- Muted Text (\`--od-muted\`): \`#64636e\`
- Cobalt Accent (\`--od-accent\`): \`#0070e3\` (\`--od-accent-fg\`: \`#ffffff\`)
- Hairline Border (\`--od-border\`): \`#e4e4e7\`

## Typography
- Sans: Inter / SF Pro / PingFang SC with \`font-variant-numeric: tabular-nums\` on metrics.
- Mono: Geist Mono / SF Mono for IDs, token keys, latency figures, and code.

## Spacing & Radius
- Base spacing unit: \`16px\`, card radius \`8px\`, interactive controls \`6px\`.

## Core Components
- Flat cards with \`1px solid var(--od-border)\`, single primary CTA per viewport, compact table rows.

## Anti-Patterns
- No unprompted purple/indigo gradients, no drop-shadow stacking, no Lorem ipsum or Acme placeholders.
`,
    tokensCss: `:root {
  --od-bg: #fbfbfb;
  --od-surface: #ffffff;
  --od-surface-2: #f4f4f5;
  --od-fg: #09090b;
  --od-muted: #64636e;
  --od-accent: #0070e3;
  --od-accent-fg: #ffffff;
  --od-border: #e4e4e7;
  --od-radius: 8px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  --od-font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
`,
  },
  {
    slug: 'warm-paper',
    name: 'Warm Paper',
    tagline: 'Archival parchment & vermilion ink — editorial reading comfort with warm tactile contrast.',
    builtin: true,
    swatches: ['#faf7f2', '#ffffff', '#1c1917', '#c2410c', '#e7e0d6'],
    designMd: `# Warm Paper — DESIGN.md

## Atmosphere & Voice
- Archival print meets modern editorial software: unhurried, tactile, legible across long sessions.
- Headings balance classical warmth with tight modern leading.

## Color Palette
- Canvas (\`--od-bg\`): \`#faf7f2\`
- Surface (\`--od-surface\`): \`#ffffff\`
- Secondary Surface (\`--od-surface-2\`): \`#f3ede4\`
- Charcoal Ink (\`--od-fg\`): \`#1c1917\`
- Warm Slate (\`--od-muted\`): \`#6b6257\`
- Terracotta Accent (\`--od-accent\`): \`#c2410c\` (\`--od-accent-fg\`: \`#ffffff\`)
- Paper Hairline (\`--od-border\`): \`#e5ddd0\`

## Typography
- Display headings may pair Georgia / Charter with clean sans UI controls.

## Spacing & Radius
- Generous vertical breathing room (\`18px\` base), crisp \`6px\` corner radius.

## Core Components
- Framed editorial cards, subtle warm dividers, understated pills, clear typographic pull-quotes.

## Anti-Patterns
- Never use sterile neon blues, glossy glassmorphism, or dark-mode glow effects on parchment.
`,
    tokensCss: `:root {
  --od-bg: #faf7f2;
  --od-surface: #ffffff;
  --od-surface-2: #f3ede4;
  --od-fg: #1c1917;
  --od-muted: #6b6257;
  --od-accent: #c2410c;
  --od-accent-fg: #ffffff;
  --od-border: #e5ddd0;
  --od-radius: 6px;
  --od-space: 18px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  --od-font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
}
`,
  },
  {
    slug: 'obsidian-terminal',
    name: 'Obsidian Terminal',
    tagline: 'Precision dark telemetry — deep graphite strata, phosphor emerald highlights, dense data.',
    builtin: true,
    swatches: ['#0c0e12', '#14171d', '#f3f4f6', '#10b981', '#262b35'],
    designMd: `# Obsidian Terminal — DESIGN.md

## Atmosphere & Voice
- Mission-critical observability console: calm in high-density data, crisp contrast, disciplined color usage.
- Color signals state (healthy emerald, amber warning, crimson alert); never decorative.

## Color Palette
- Canvas (\`--od-bg\`): \`#0c0e12\`
- Surface (\`--od-surface\`): \`#14171d\`
- Elevated Surface (\`--od-surface-2\`): \`#1b2029\`
- Frost Ink (\`--od-fg\`): \`#f3f4f6\`
- Muted Steel (\`--od-muted\`): \`#9ca3af\`
- Emerald Accent (\`--od-accent\`): \`#10b981\` (\`--od-accent-fg\`: \`#052e1e\`)
- Hairline Border (\`--od-border\`): \`#262b35\`

## Typography
- UI Sans + dominant monospace telemetry readouts with \`tabular-nums\`.

## Spacing & Radius
- Compact \`14px\` rhythm, sharp \`6px\` radius for engineering precision.

## Anti-Patterns
- No glowing neon bloom shadows, no rainbow chart palettes, no low-contrast grey-on-grey text.
`,
    tokensCss: `:root {
  --od-bg: #0c0e12;
  --od-surface: #14171d;
  --od-surface-2: #1b2029;
  --od-fg: #f3f4f6;
  --od-muted: #9ca3af;
  --od-accent: #10b981;
  --od-accent-fg: #052e1e;
  --od-border: #262b35;
  --od-radius: 6px;
  --od-space: 14px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  --od-font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
`,
  },
  {
    slug: 'civic-mint',
    name: 'Civic Mint',
    tagline: 'Trustworthy financial & healthcare clarity — soft sage tint, deep pine ink, generous touch targets.',
    builtin: true,
    swatches: ['#f4f7f6', '#ffffff', '#0f231f', '#0d9488', '#dbe4e1'],
    designMd: `# Civic Mint — DESIGN.md

## Atmosphere & Voice
- Reassuring, transparent, and legible: built for billing, banking, and consumer workflows.
- Numbers, dates, and status pills must be effortless to scan at a glance.

## Color Palette
- Canvas (\`--od-bg\`): \`#f4f7f6\`
- Surface (\`--od-surface\`): \`#ffffff\`
- Soft Mint Surface (\`--od-surface-2\`): \`#e9f1ef\`
- Deep Pine Ink (\`--od-fg\`): \`#0f231f\`
- Slate Green Muted (\`--od-muted\`): \`#516662\`
- Teal Accent (\`--od-accent\`): \`#0d9488\` (\`--od-accent-fg\`: \`#ffffff\`)
- Border (\`--od-border\`): \`#dbe4e1\`

## Spacing & Radius
- Generous \`16px\` spacing, welcoming \`10px\` corner radius, >= 44px mobile touch targets.

## Anti-Patterns
- Avoid aggressive urgency banners, cluttered multi-badge cells, or tiny muted disclaimers.
`,
    tokensCss: `:root {
  --od-bg: #f4f7f6;
  --od-surface: #ffffff;
  --od-surface-2: #e9f1ef;
  --od-fg: #0f231f;
  --od-muted: #516662;
  --od-accent: #0d9488;
  --od-accent-fg: #ffffff;
  --od-border: #dbe4e1;
  --od-radius: 10px;
  --od-space: 16px;
  --od-font-scale: 1;
  --od-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
  --od-font-mono: ui-monospace, 'SF Mono', Menlo, monospace;
}
`,
  },
];
