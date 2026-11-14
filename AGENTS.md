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

## Validation Before Commit

After editing `loadouts/`, `decks/`, `upstreams.json`, or `marketplace.json`:

1. Run `node tools/sync-upstreams.mjs --counts` if component counts may have changed.
2. Run `node tools/sync-upstreams.mjs --verify` and ensure all Loadouts and Decks pass count, JSON, subagent tier, and Lumzel Market preview limits.
