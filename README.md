# Lumzel Hub (`lumzel/lumzel-hub`)

Official open-source repository of **Loadouts** and **Decks** for [Lumzel](https://github.com/lumzel/lumzel-hub).

A single repository can host both **Loadouts** (complete Agent persona + instructions + bundled skills/subagents/rules/hooks/MCP/plugins/env) and **Decks** (interactive HTML/JS workbench panels powered by `/sdk.js`).

---

## Included Loadouts

> Live component counts (`skills`, `agents`, `rules`, `hooks`, `mcp`, `plugins`, `env`) are computed automatically into `marketplace.json`'s `counts` field by `tools/sync-upstreams.mjs`.

| ID | Category | Name | Upstream | Bundled Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `daily-driver` | `Workflow` | 🧠 Daily Driver | Curated Multi-Repo (`upstreams.json`) | 11 Curated Skills, 5 Review/Eval Subagents, 4 MCP Configs (`graphify`, `plan`, `agent-native-dispatch`, `github-agentic-workflows`), 3 Graphify Hooks, `graphify-memory` Rule, `GRAPHIFY_HOOK_STRICT` Env |
| `everything-claude-code` | `Engineering` | ⚡ Everything Claude Code (ECC) | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | 314 Canonical Skills, 71 Subagents (with `model`/`tools` params), 121 Common & Multi-Language Rules, 8 Lifecycle Quality Hooks, 35 MCP Configs, 22 Runtime & MCP Env Vars |
| `matt-pocock` | `Workflow` | 🎯 Matt Pocock Workflow | [`mattpocock/skills`](https://github.com/mattpocock/skills) | 39 Upstream Skills (with companion testing/architecture docs), 3 Review/Explorer Subagents, 2 Rules (`mp-engineering-philosophy`, `mp-domain-glossary`), `mp-git-guardrails` Hook |
| `superpowers` | `Workflow` | 🦸 Obra Superpowers | [`obra/superpowers`](https://github.com/obra/superpowers) | 15 Upstream Skills (with prompts, references & templates), 6 Implementation/Review/Diagnostic Subagents, `superpowers-session-start` Hook, Iron Laws Rule |
| `compound-engineering` | `Workflow` | 🔄 Compound Engineering | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | 38 Canonical `ce-*` / `lfg` / `wtf` Skills, 55 Research/Review Subagents & Personas (with `model` params), 3 Coding/Authoring/PR Review Rules |
| `gstack` | `Workflow` | 🚀 Garry Tan gstack | [`garrytan/gstack`](https://github.com/garrytan/gstack) | 66 Full-Lifecycle, Browser & OpenClaw Skills, 3 Specialist Subagents, 3 `careful`/`freeze`/SessionStart Hooks, `gbrain` MCP Config, Boil-the-Lake Rule, 2 Env Flags |
| `spec-kit` | `Architecture` | 📐 GitHub Spec-Kit (SDD) | [`github/spec-kit`](https://github.com/github/spec-kit) | 9 Core `speckit-*` SDD Workflow Skills (with bundled templates), 2 Subagents, `specify` MCP Config, Principles Rule, 3 `SPECIFY_*` Env Vars |
| `agent-native` | `Workflow` | 🧩 Builder.io Agent-Native | [`BuilderIO/agent-native`](https://github.com/BuilderIO/agent-native) | 10 Public Skills for workspace apps, visual plans, design editing, content, assets and turning workflows into apps; Dispatch, Design and Plans MCP Configs |

## Included Decks

| ID | Category | Title | Capabilities |
| :--- | :--- | :--- | :--- |
| `spec-workbench` | `Workflow` | Spec Workbench | Visual design docs, tickets, clickable prototypes + bundled `spec-workbench-*` skills & subagents |


---

## Multi-Language (`i18n`) Convention

Every repository catalog (`marketplace.json`), Loadout (`loadout.yaml`), and Deck (`deck.json`) supports multi-language names/titles and descriptions with automatic **English fallback**:

1. **Base fields are English**: Set top-level `name` (or `title` on Decks) and `description` in English so older clients and unlocalized tools always see readable defaults.
2. **Extensible `i18n` locale map**: Add any BCP-47 language tag (`"en"`, `"zh-CN"`, `"ja"`, `"ko"`, `"fr"`, etc.) under `i18n`. No schema migration is required when adding new languages in the future.
3. **Resolution order in Lumzel**:
   - Exact locale match (e.g. `zh-CN` → `i18n["zh-CN"]`)
   - Primary language subtag match (e.g. `zh-TW` → `zh` / `zh-CN`, `en-US` → `en`)
   - English fallback (`i18n["en"]`)
   - Base top-level field (`name` / `title` / `description`), then `id`

### `loadout.yaml` Example

```yaml
id: daily-driver
name: Daily Driver
description: "A lightweight everyday engineering companion: visual explainers & diagrams, iterative planning, public-seam TDD, dual-axis code review, persistent Graphify memory, and natural human-sounding writing."
i18n:
  en:
    name: Daily Driver
    description: "A lightweight everyday engineering companion: visual explainers & diagrams, iterative planning, public-seam TDD, dual-axis code review, persistent Graphify memory, and natural human-sounding writing."
  es:
    name: "Flujo de Desarrollo Diario"
    description: "Un companero de ingenieria ligero para el dia a dia: explicaciones visuales, diagramas, planificacion iterativa y TDD de costuras publicas."
```

### `deck.json` Example

```json
{
  "id": "spec-workbench",
  "title": "Spec Workbench",
  "description": "Ship features from rough idea to design, tickets, and clickable prototype.",
  "i18n": {
    "en": {
      "title": "Spec Workbench",
      "description": "Ship features from rough idea to design, tickets, and clickable prototype."
    },
    "es": {
      "title": "Mesa de Trabajo de Especificaciones",
      "description": "Lleve las funciones desde una idea aproximada hasta el diseno, los tickets y el prototipo interactivo."
    }
  },
  "entry": "index.html"
}
```

---

## Repository Layout

```text
lumzel-hub/
├── marketplace.json                 # Index manifest for in-app Marketplace discovery
├── upstreams.json                   # Declarative upstream sources & pinned SHAs (curated + full suites)
├── tools/
│   ├── sync-upstreams.mjs           # Zero-dependency upstream synchronizer & catalog verifier
│   └── render-previews.mjs          # Automated Deck cover renderer
├── loadouts/
│   └── <loadout-id>/
│       ├── loadout.yaml             # Loadout metadata, structured subagent params, library refs & env defaults
│       ├── AGENTS.md                # System instructions for the Loadout
│       ├── skills/<name>/SKILL.md   # Bundled Skills (auto-installed into Library)
│       ├── agents/<name>.md         # Bundled Subagents (prompt body + loadout.yaml model/tools params)
│       ├── rules/<name>.md          # Bundled Rules (with optional globs)
│       ├── hooks/<name>.json        # Bundled Hooks (SessionStart / PreToolUse / PostToolUse / PreCompact / Stop)
│       ├── mcp/<name>.json          # Bundled MCP server configs (stdio / http, ${env:VAR} placeholders)
│       └── plugins/<name>/          # Optional bundled Claude/Codex plugin packs (.claude-plugin/plugin.json)
└── decks/
    └── <deck-id>/
        ├── deck.json                # Deck manifest (id, title, description, i18n, icon, entry, uses, permissions)
        ├── index.html               # Entry HTML (uses /sdk.js)
        ├── style.css                # Stylesheet (supports light/dark theme tokens)
        ├── app.js                   # Module script interacting with window.deck
        └── skills/<name>/SKILL.md   # Optional Deck-scoped skills
```

---

## Supported Import & Schema Formats in Lumzel

Lumzel supports browsing repositories directly in the **Loadout** and **Deck** pages, as well as importing via multiple schemas:

1. **Add a Repository to Marketplace**
   - `https://github.com/lumzel/lumzel-hub`
   - `lumzel/lumzel-hub`

2. **Import a Specific Loadout or Deck**
   - **GitHub Tree URL**: `https://github.com/lumzel/lumzel-hub/tree/main/loadouts/daily-driver`
   - **Shorthand (`owner/repo/id`)**: `lumzel/lumzel-hub/daily-driver` or `lumzel/lumzel-hub/matt-pocock`
   - **Lumzel URI Schema**:
     - `lumzel://loadout/lumzel/lumzel-hub/daily-driver`
     - `lumzel://loadout/lumzel/lumzel-hub/everything-claude-code`
     - `lumzel://deck/lumzel/lumzel-hub/spec-workbench`
     - `lumzel://repo/lumzel/lumzel-hub`
   - **Local Folder Path**: `/path/to/my-loadout-or-deck`

---

## Previews in Lumzel

A card in the Lumzel market opens a detail page before anything is installed.

- **A Deck runs for real.** Its entry page loads in a sandbox (`sandbox="allow-scripts"`, no network) on a bridge that answers `deck.context()` and refuses every other call. `context().preview` is `true` there: a Deck that needs data draws sample data of its own when it sees it.
- **A Loadout is shown read only**: its instructions and every skill, subagent, rule, hook and MCP server it brings, each one openable.
- **Covers and screenshots are optional.** An entry in `marketplace.json` may name them, as paths inside the item's folder (`png`, `jpg`, `webp` or `gif`, at most 1 MB for a cover):

```json
{
  "id": "spec-workbench",
  "source": "./decks/spec-workbench",
  "cover": { "light": "preview/cover-light.webp", "dark": "preview/cover-dark.webp" },
  "coverViewport": [1200, 750]
}
```

`cover` and each `screenshots` item is one path, or `{ "light": …, "dark": … }`.

Deck covers in this repository are rendered, not drawn by hand: `node tools/render-previews.mjs` loads every Deck the way the preview does and writes `decks/<id>/preview/cover-{light,dark}.webp` (1600×1000, WebP quality 80, about 25 KB each). It needs `playwright` and `cwebp`. The `Deck previews` workflow runs it on macOS with WebKit after a push that changes a Deck, and commits the images. `tools/sdk.js` is a copy of the SDK Lumzel serves at `/sdk.js`.

A Deck that needs a project to show anything ships a sample one. `spec-workbench` does: when `context().preview` is true it lists `src/sample.js` instead of asking for the Worktree's docs, and opens the pages under `sample/docs/` from its own folder. Those pages end with a `<script>` for `runtime/worktree.js`, which Lumzel appends by itself to the pages of a real project. An entry whose Deck needs a larger window for its cover names it: `"coverViewport": [1200, 750]`.

---

## Declarative Upstream Auto-Sync (`upstreams.json` + CI)

Loadouts stay self-contained in `loadouts/<id>/` (enabling single-folder sparse checkout and instant in-app Market Previews) while tracking upstream GitHub repositories through `upstreams.json` and `tools/sync-upstreams.mjs`:

- **`curated` mode** (e.g. `daily-driver`): Composes individual Skills from multiple upstream repositories (`repo` + `path` or `skillFile` + `extraDirs`) alongside Hub-maintained `AGENTS.md`, `rules/`, and portable `mcp/` configs.
  - `agent-native` bundles the upstream's public `skills/` collection, preserving companion references and tracking its plugin MCP configs. `skills/visual-plans` is installed as `visual-plan` to match the skill's declared name. It includes the upstream MIT license. Service sign-in is required where prompted; importing the Loadout does not install the Agent-Native framework or run an app.
- **`suite` mode** (e.g. `everything-claude-code`, `matt-pocock`, `superpowers`, `spec-kit`, `compound-engineering`, `gstack`): Mirrors complete upstream suites and adapts skills, subagents, rules, and MCP configs into Lumzel's standard Loadout layout while preserving Hub-specific hooks/rules listed in `preserve`.

```bash
# Dry-run check for new upstream commits via git ls-remote
node tools/sync-upstreams.mjs --check

# Incrementally sync changed upstreams and regenerate loadout.yaml manifests
node tools/sync-upstreams.mjs

# Sync specific Loadout(s) or force full re-sync
node tools/sync-upstreams.mjs --only daily-driver,matt-pocock --force

# Regenerate structured component counts in marketplace.json without network fetches
node tools/sync-upstreams.mjs --counts

# Verify catalog manifests, counts drift, JSON configs, and Lumzel Market Preview bounds (<= 2000 files, <= 20 MiB)
node tools/sync-upstreams.mjs --verify
```

The GitHub Actions workflow (`.github/workflows/sync-upstreams.yml`) runs daily (`03:00 UTC`) and on manual `workflow_dispatch`, opening or updating a rolling `chore/sync-upstreams` Pull Request with upstream commit compare links and per-Loadout component diffs.

---

## Creating Your Own Repository

1. Create a GitHub repository with `marketplace.json` at the root (or `.lumzel-plugin/marketplace.json`).
2. List your `loadouts` and/or `decks` in `marketplace.json` (optional `counts` renders component badges on Market cards without hardcoding numbers in descriptions):

```json
{
  "name": "My Team Hub",
  "owner": { "name": "Acme Eng" },
  "i18n": {
    "en": { "name": "My Team Hub", "description": "Internal Loadouts and Decks" },
    "es": { "name": "Repositorio Interno", "description": "Loadouts y Decks compartidos del equipo" }
  },
  "loadouts": [
    {
      "id": "backend-go",
      "name": "Go Microservices Loadout",
      "icon": "🐹",
      "description": "Go service conventions, protobuf rules, and gRPC debugging skills.",
      "i18n": {
        "en": {
          "name": "Go Microservices Loadout",
          "description": "Go service conventions, protobuf rules, and gRPC debugging skills."
        },
        "es": {
          "name": "Suite de Microservicios Go",
          "description": "Convenciones de servicios Go, reglas de protobuf y habilidades de depuracion gRPC."
        }
      },
      "category": "Backend",
      "author": "Acme Eng",
      "counts": {
        "skills": 3,
        "rules": 1
      },
      "source": "./loadouts/backend-go"
    }
  ],
  "decks": [
    {
      "id": "incident-triage",
      "title": "Incident Triage Deck",
      "icon": "zap",
      "description": "On-call runbook and service health check deck.",
      "i18n": {
        "en": {
          "title": "Incident Triage Deck",
          "description": "On-call runbook and service health check deck."
        },
        "es": {
          "title": "Panel de Triaje de Incidentes",
          "description": "Manual de guardia y panel de verificacion del estado de los servicios."
        }
      },
      "category": "SRE",
      "author": "Acme Eng",
      "counts": {
        "skills": 2
      },
      "source": "./decks/incident-triage"
    }
  ]
}
```

3. In Lumzel, open **Loadout** or **Deck**, click **+ Add repository…**, and enter `https://github.com/<owner>/<repo>`.
4. Whenever you push new commits to your repository, Lumzel automatically detects the remote commit change via `git ls-remote` and shows an **Update** button on installed cards.
