# Lumzel Hub Repository Instructions

## Loadout & Deck Versioning (`marketplace.json`)

Every Loadout and Deck entry in `marketplace.json` carries a `version` string following **Semantic Versioning (`MAJOR.MINOR.PATCH`)**. Lumzel compares this catalog version against installed items to surface updates.

Whenever you modify a Loadout under `loadouts/<id>/` (or a Deck under `decks/<id>/`), bump its `version` in `marketplace.json` according to the scope of change:

- **PATCH (`x.y.Z`)** — Small, backwards-compatible tweaks and fixes:
  - Wording clarifications, typo or documentation fixes in `AGENTS.md`, `rules/`, or `skills/`
  - Minor hook script fixes or metadata/i18n refinements
  - Routine upstream bugfix syncs that do not add, remove, or break capabilities
- **MINOR (`x.Y.0`)** — Backwards-compatible feature or capability additions:
  - Adding new bundled `skills/`, `agents/`, `rules/`, `hooks/`, `mcp/`, or `env` defaults
  - Meaningful workflow or UI enhancements that preserve existing usage expectations
- **MAJOR (`X.0.0`)** — Breaking or structural changes:
  - Removing bundled `skills/`, `agents/`, `mcp/` servers, or core capabilities users may rely on
  - Renaming IDs, entrypoints, or slash commands, or fundamentally changing how an integration works (for example, replacing an MCP integration with a CLI-only workflow or changing required permissions/runtime dependencies)

When multiple changes are batched into one update, bump by the highest applicable level and reset lower segments to `0`.

## Loadout Language Policy (`loadouts/<id>/`)

All Lumzel-authored Loadout content **must** default to English:

1. **Manifests (`loadout.yaml`)**: Top-level `name`, `description`, and `env_schema.<KEY>` fields (`label`, `description`, `placeholder`, `options[].label`) must be authored in English. Place localized translations (such as `zh-CN`) inside `i18n.<locale>` blocks.
2. **Lumzel-Authored Components**: Author `AGENTS.md`, `rules/`, `skills/`, and `agents/` in English by default (bilingual trigger keywords in `SKILL.md` descriptions are acceptable when helpful for discovery).
3. **Exceptions**: Preserve upstream-synced components verbatim and keep intentionally language-specific skills (such as `humanizer-zh`) untouched.

## Deck Theme Requirements (`decks/<id>/`)

Every Deck in `decks/<id>/` **must** adapt automatically to both Lumzel `'light'` and `'dark'` themes:

1. **CSS Tokens**: Either link `/lib/v1/base.css` (and consume `--deck-*` variables) or define complete semantic custom properties under both `:root` (or `[data-theme="light"]`) and `:root[data-theme="dark"]` (preferably with `@media (prefers-color-scheme: dark)` fallback). Set matching `color-scheme: light` / `dark`.
2. **No Single-Theme Hardcoding**: Do not hardcode fixed light/dark colors (`#fff`, `#000`, etc.) on page backgrounds, card surfaces, borders, text, or inline SVG fills (`currentColor` or `var(--...)` only).
3. **Runtime Sync**: Call `window.deck.context()` at startup (which `/sdk.js` uses to mirror `theme` onto `<html data-theme>` and update on live `theme.changed` pushes). Use `window.deck.ui.onThemeChange(theme => ...)` if Canvas/charts/subframes hold JS theme state.
4. **Cover Previews**: Verify both `preview/cover-light.webp` and `preview/cover-dark.webp` render legibly with distinct light/dark palettes via `node tools/render-previews.mjs <deck-id>`.

## Deck Multi-Language Requirements (`decks/<id>/`)

Every Deck in `decks/<id>/` **must** support multiple languages (English default + localized translations such as `zh-CN`):

1. **English Default Manifest & Static HTML**: Keep top-level `deck.json` fields (`title`, `description`, `params[]` `label`/`description`/`placeholder`/`options[].label`) and static HTML fallbacks (`index.html`, `<html lang="en">`) in English.
2. **Manifest `i18n`**: Declare `i18n` blocks (including `en` and `zh-CN`) on `deck.json` and localized parameter labels/descriptions/placeholders under `params[].i18n`.
3. **Runtime Locale Adaptation**: Read `ctx.locale` from `window.deck.context()` at startup (falling back to English for non-matching locales). Adapt all rendered UI strings, dynamic labels, generated Agent prompts, embedded iframe runtimes (`runtime/*.js`), and Market Preview sample data (`preview: true`) to the active locale—never leave hardcoded Chinese strings in English mode.
4. **Bundled Skills & Agents**: Author bundled Deck `skills/` and `agents/` in English by default, and instruct Agents to author generated workspace artifacts in the user's conversation language.

## Validation Before Commit

After editing `loadouts/`, `decks/`, `upstreams.json`, or `marketplace.json`:

1. Run `node tools/sync-upstreams.mjs --counts` if component counts may have changed.
2. Run `node tools/sync-upstreams.mjs --verify` and ensure all Loadouts and Decks pass count, JSON, language/i18n, theme, subagent tier, and Lumzel Market preview limits.
3. If you modified a Deck's UI, run `node tools/render-previews.mjs <deck-id>` (when Playwright/cwebp are available) to verify both `light` and `dark` covers render with clear theme contrast.

