# Lumzel Hub (`lumzel/lumzel-hub`)

Official open-source repository of **Loadouts** and **Decks** for [Lumzel](https://github.com/lumzel/lumzel-hub).

A single repository can host both **Loadouts** (complete Agent persona + instructions + bundled skills/agents/rules/hooks/MCP) and **Decks** (interactive HTML/JS workbench panels powered by `/sdk.js`).

---

## Included Loadouts

> Live component counts (`skills`, `agents`, `rules`, `hooks`, `mcp`) are computed automatically into `marketplace.json`'s `counts` field by `tools/sync-upstreams.mjs`.

| ID | Category | Name (`en` / `zh-CN`) | Upstream | Bundled Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `daily-workflow` | `Workflow` | 🧠 Daily Engineering Workflow / 日常全能研发工作流 | Curated Multi-Repo (`upstreams.json`) | Curated Skills (`answer-me-with-html`, `visual-plan`, `show-me`, `excalidraw-diagram-generator`, `git-commit`, `humanizer`, `humanizer-zh`, `eli5`, `code-review`, `tdd`, `graphify`, `skill-creator`), `graphify` MCP (`uvx`), `graphify-memory` Rule |
| `everything-claude-code` | `Engineering` | ⚡ Everything Claude Code (ECC) / 全栈工程套件 | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | Full-stack & domain Skills, Specialist Subagents, Common & Multi-Language Rules, Hooks, MCP Configs |
| `tdd-engineer` | `Engineering` | 🧪 TDD Craft Engineer / TDD 测试驱动工程师 | Lumzel Official | Public Seam Red-Green-Refactor Instructions |
| `matt-pocock` | `Workflow` | 🎯 Matt Pocock Workflow / 研发工作流 | [`mattpocock/skills`](https://github.com/mattpocock/skills) | Upstream Skills (with companion testing/architecture docs), Review/Explorer Subagents, Rule |
| `superpowers` | `Workflow` | 🦸 Obra Superpowers / 工程纪律套件 | [`obra/superpowers`](https://github.com/obra/superpowers) | Upstream Skills (with prompts, references & templates), Subagents, SessionStart Hook, Iron Laws Rule |
| `compound-engineering` | `Workflow` | 🔄 Compound Engineering / 复利工程 | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | `ce-*` / `lfg` / `wtf` Workflow Skills, Specialist Research & Review Subagents, Coding Standards Rule |
| `gstack` | `Workflow` | 🚀 Garry Tan gstack / 交付工作流 | [`garrytan/gstack`](https://github.com/garrytan/gstack) | Full-Lifecycle Delivery Skills, Specialist Subagents, Boil-the-Lake Ethos Rule |
| `spec-kit` | `Architecture` | 📐 GitHub Spec-Kit (SDD) / 规格驱动开发 | [`github/spec-kit`](https://github.com/github/spec-kit) | `speckit-*` SDD Workflow Skills (bundled with official templates), Subagents, Principles Rule |
| `fullstack-architect` | `Architecture` | 🏛️ Fullstack Architect / 全栈系统架构师 | Lumzel Official | `architecture-adr` Skill + System Architecture & Boundary Instructions |
| `security-auditor` | `Security` | 🛡️ Security & Reliability Auditor / 安全与可靠性审计师 | Lumzel Official | `owasp-security-audit` Skill + Threat Modeling & Concurrency Audit |
| `frontend-craftsman` | `Frontend` | ✨ Frontend UI Craftsman / 前端与桌面界面工匠 | Lumzel Official | Design Tokens, Accessibility & Desktop-Grade UI Polish |

## Included Decks

| ID | Category | Title (`en` / `zh-CN`) | Capabilities |
| :--- | :--- | :--- | :--- |
| `spec-workbench` | `Workflow` | Spec Workbench / 方案工作台 | Visual design docs, tickets, clickable prototypes + bundled `spec-workbench-*` skills & subagents |
| `pr-review-board` | `Code Review` | PR Review Board / 代码审查面板 | Dual-axis Standards & Spec code review board + bundled `pr-review-board-*` skills |
| `release-readiness` | `DevOps` | Release Readiness / 发版就绪看板 | Release checklist, changelog summary, and Agent verification gate + bundled `release-readiness-*` skills |
| `architecture-radar` | `Architecture` | Architecture Radar / 架构与模块雷达 | Module boundaries, dependency health, and Agent structural analysis + bundled `architecture-radar-*` skills |

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
id: fullstack-architect
name: Fullstack Architect
description: "End-to-end system architect focused on domain modeling, ADR trade-off analysis, API contracts, and cross-layer refactoring."
i18n:
  en:
    name: Fullstack Architect
    description: "End-to-end system architect focused on domain modeling, ADR trade-off analysis, API contracts, and cross-layer refactoring."
  zh-CN:
    name: "全栈系统架构师"
    description: "面向端到端系统设计：专注领域建模、ADR 方案权衡、接口契约设计与跨层重构。"
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
├── upstreams.json                   # Declarative upstream sources & pinned SHAs (curated skills + full suites)
├── tools/
│   ├── sync-upstreams.mjs           # Zero-dependency upstream synchronizer & catalog verifier
│   └── render-previews.mjs          # Automated Deck cover renderer
├── loadouts/
│   └── <loadout-id>/
│       ├── loadout.yaml             # Loadout metadata (with optional i18n), runtime params, and library references
│       ├── AGENTS.md                # System instructions for the Loadout
│       ├── skills/<name>/SKILL.md   # Optional bundled Skills (auto-installed into Library)
│       ├── agents/<name>.md         # Optional bundled Subagents
│       ├── rules/<name>.md          # Optional bundled Rules
│       ├── hooks/<name>.json        # Optional bundled Hooks
│       └── mcp/<name>.json          # Optional bundled MCP server configs
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
   - **GitHub Tree URL**: `https://github.com/lumzel/lumzel-hub/tree/main/loadouts/daily-workflow`
   - **Shorthand (`owner/repo/id`)**: `lumzel/lumzel-hub/daily-workflow` or `lumzel/lumzel-hub/matt-pocock`
   - **Lumzel URI Schema**:
     - `lumzel://loadout/lumzel/lumzel-hub/daily-workflow`
     - `lumzel://loadout/lumzel/lumzel-hub/everything-claude-code`
     - `lumzel://deck/lumzel/lumzel-hub/release-readiness`
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
  "id": "release-readiness",
  "source": "./decks/release-readiness",
  "cover": { "light": "preview/cover-light.webp", "dark": "preview/cover-dark.webp" },
  "screenshots": ["preview/board.webp"]
}
```

`cover` and each `screenshots` item is one path, or `{ "light": …, "dark": … }`.

Deck covers in this repository are rendered, not drawn by hand: `node tools/render-previews.mjs` loads every Deck the way the preview does and writes `decks/<id>/preview/cover-{light,dark}.webp` (1600×1000, WebP quality 80, about 25 KB each). It needs `playwright` and `cwebp`. The `Deck previews` workflow runs it on macOS with WebKit after a push that changes a Deck, and commits the images. `tools/sdk.js` is a copy of the SDK Lumzel serves at `/sdk.js`.

A Deck that needs a project to show anything ships a sample one. `spec-workbench` does: when `context().preview` is true it lists `src/sample.js` instead of asking for the Worktree's docs, and opens the pages under `sample/docs/` from its own folder. Those pages end with a `<script>` for `runtime/worktree.js`, which Lumzel appends by itself to the pages of a real project. An entry whose Deck needs a larger window for its cover names it: `"coverViewport": [1200, 750]`.

---

## Declarative Upstream Auto-Sync (`upstreams.json` + CI)

Loadouts stay self-contained in `loadouts/<id>/` (enabling single-folder sparse checkout and instant in-app Market Previews) while tracking upstream GitHub repositories through `upstreams.json` and `tools/sync-upstreams.mjs`:

- **`curated` mode** (e.g. `daily-workflow`): Composes individual Skills from multiple upstream repositories (`repo` + `path` or `skillFile` + `extraDirs`) alongside Hub-maintained `AGENTS.md`, `rules/`, and portable `mcp/` configs.
- **`suite` mode** (e.g. `everything-claude-code`, `matt-pocock`, `superpowers`, `spec-kit`, `compound-engineering`, `gstack`): Mirrors complete upstream suites and adapts skills, subagents, rules, and MCP configs into Lumzel's standard Loadout layout while preserving Hub-specific hooks/rules listed in `preserve`.

```bash
# Dry-run check for new upstream commits via git ls-remote
node tools/sync-upstreams.mjs --check

# Incrementally sync changed upstreams and regenerate loadout.yaml manifests
node tools/sync-upstreams.mjs

# Sync specific Loadout(s) or force full re-sync
node tools/sync-upstreams.mjs --only daily-workflow,matt-pocock --force

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
