# Lumzel Hub (`lumzel/lumzel-hub`)

Official open-source repository of **Loadouts** and **Decks** for [Lumzel](https://github.com/lumzel/lumzel-hub).

A single repository can host both **Loadouts** (complete Agent persona + instructions + bundled skills/subagents/rules/hooks/MCP/plugins/env) and **Decks** (interactive HTML/JS workbench panels powered by `/sdk.js`).

---

## Included Loadouts

> Live component counts (`skills`, `agents`, `rules`, `hooks`, `mcp`, `plugins`, `env`) are computed automatically into `marketplace.json`'s `counts` field by `tools/sync-upstreams.mjs`.

| ID | Category | Name (`en` / `zh-CN`) | Upstream | Bundled Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `daily-driver` | `Workflow` | 🧠 Daily Driver / 日常主力研发工作流 | Curated Multi-Repo (`upstreams.json`) | 14 Curated Skills, 5 Review/Eval Subagents, 4 MCP Configs (`graphify`, `plan`, `agent-native-dispatch`, `github-agentic-workflows`), 2 Plugins (`rpi`, `visual-pr`), 3 Graphify Hooks, `graphify-memory` Rule, `GRAPHIFY_HOOK_STRICT` Env |
| `everything-claude-code` | `Engineering` | ⚡ Everything Claude Code (ECC) / 全栈工程套件 | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | 314 Canonical Skills, 71 Subagents (with `model`/`tools` params), 121 Common & Multi-Language Rules, 8 Lifecycle Quality Hooks, 35 MCP Configs, 22 Runtime & MCP Env Vars |
| `matt-pocock` | `Workflow` | 🎯 Matt Pocock Workflow / 研发工作流 | [`mattpocock/skills`](https://github.com/mattpocock/skills) | 39 Upstream Skills (with companion testing/architecture docs), 3 Review/Explorer Subagents, 2 Rules (`mp-engineering-philosophy`, `mp-domain-glossary`), `mp-git-guardrails` Hook |
| `superpowers` | `Workflow` | 🦸 Obra Superpowers / 工程纪律套件 | [`obra/superpowers`](https://github.com/obra/superpowers) | 15 Upstream Skills (with prompts, references & templates), 6 Implementation/Review/Diagnostic Subagents, `superpowers-session-start` Hook, Iron Laws Rule |
| `compound-engineering` | `Workflow` | 🔄 Compound Engineering / 复利工程 | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | 38 Canonical `ce-*` / `lfg` / `wtf` Skills, 55 Research/Review Subagents & Personas (with `model` params), 3 Coding/Authoring/PR Review Rules |
| `gstack` | `Workflow` | 🚀 Garry Tan gstack / 交付工作流 | [`garrytan/gstack`](https://github.com/garrytan/gstack) | 66 Full-Lifecycle, Browser & OpenClaw Skills, 3 Specialist Subagents, 3 `careful`/`freeze`/SessionStart Hooks, `gbrain` MCP Config, Boil-the-Lake Rule, 2 Env Flags |
| `spec-kit` | `Architecture` | 📐 GitHub Spec-Kit (SDD) / 规格驱动开发 | [`github/spec-kit`](https://github.com/github/spec-kit) | 9 Core `speckit-*` SDD Workflow Skills (with bundled templates), 2 Subagents, `specify` MCP Config, Principles Rule, 3 `SPECIFY_*` Env Vars |

## Included Decks

| ID | Category | Title (`en` / `zh-CN`) | Capabilities |
| :--- | :--- | :--- | :--- |
| `spec-workbench` | `Workflow` | Spec Workbench / 方案工作台 | Visual design docs, tickets, clickable prototypes + bundled `spec-workbench-*` skills & subagents |


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
description: "Everyday engineering companion across all 7 Library categories: visual HTML explainers & diagrams, iterative planning, public-seam TDD, dual-axis code review, RPI & Visual PR plugins, Graphify memory + hooks, and portable MCP servers."
i18n:
  en:
    name: Daily Driver
    description: "Everyday engineering companion across all 7 Library categories: visual HTML explainers & diagrams, iterative planning, public-seam TDD, dual-axis code review, RPI & Visual PR plugins, Graphify memory + hooks, and portable MCP servers."
  zh-CN:
    name: "日常主力研发工作流"
    description: "覆盖全部 7 类资源的日常主力研发套件：可视化单页与架构制图、交互式方案规划、公共边界 TDD、双轴代码审查子代理、RPI 与 Visual PR 插件、Graphify 知识图谱记忆与自动 Hook 及多款便携 MCP 服务。"
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
    "zh-CN": {
      "title": "方案工作台",
      "description": "从想法到技术方案、工单与可点击原型的可视化研发工作台。"
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
    "zh-CN": { "name": "团队内部仓库", "description": "团队共享的 Loadout 与 Deck" }
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
        "zh-CN": {
          "name": "Go 微服务开发套件",
          "description": "包含 Go 服务编码规范、Protobuf 约束与 gRPC 排障技能。"
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
        "zh-CN": {
          "title": "故障排查看板",
          "description": "值班应急手册与服务健康状态检查工作台。"
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
