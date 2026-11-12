# Lumzel Hub (`lumzel/lumzel-hub`)

Official open-source repository of **Loadouts** and **Decks** for [Lumzel](https://github.com/lumzel/lumzel-hub).

A single repository can host both **Loadouts** (complete Agent persona + instructions + bundled skills/agents/rules/hooks/MCP) and **Decks** (interactive HTML/JS workbench panels powered by `/sdk.js`).

---

## Included Loadouts

| ID | Category | Name (`en` / `zh-CN`) | Upstream | Bundled Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `everything-claude-code` | `Engineering` | ⚡ Everything Claude Code (ECC) / 全栈工程套件 | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | 271 Skills, 67 Subagents, 113 Common & Language Rules, 3 Hooks, 32 MCP Configs |
| `tdd-engineer` | `Engineering` | 🧪 TDD Craft Engineer / TDD 测试驱动工程师 | Lumzel Official | Public Seam Red-Green-Refactor Instructions |
| `matt-pocock` | `Workflow` | 🎯 Matt Pocock Workflow / 研发工作流 | [`mattpocock/skills`](https://github.com/mattpocock/skills) | 39 Skills (with companion testing/architecture docs), 3 Subagents, 1 Rule |
| `superpowers` | `Workflow` | 🦸 Obra Superpowers / 工程纪律套件 | [`obra/superpowers`](https://github.com/obra/superpowers) | 15 Skills (with prompts, references & templates), 3 Subagents, 1 Hook, 1 Rule |
| `compound-engineering` | `Workflow` | 🔄 Compound Engineering / 复利工程 | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | 37 `ce-*` / `lfg` / `wtf` Skills, 26 Specialist Subagents, 1 Rule |
| `gstack` | `Workflow` | 🚀 Garry Tan gstack / 交付工作流 | [`garrytan/gstack`](https://github.com/garrytan/gstack) | 62 Full-Lifecycle Skills, 3 Subagents, 1 Ethos Rule |
| `spec-kit` | `Architecture` | 📐 GitHub Spec-Kit (SDD) / 规格驱动开发 | [`github/spec-kit`](https://github.com/github/spec-kit) | 9 `speckit-*` Workflow Skills (bundled with official templates), 2 Subagents, 1 Rule |
| `fullstack-architect` | `Architecture` | 🏛️ Fullstack Architect / 全栈系统架构师 | Lumzel Official | `architecture-adr` Skill + System Architecture & Boundary Instructions |
| `security-auditor` | `Security` | 🛡️ Security & Reliability Auditor / 安全与可靠性审计师 | Lumzel Official | `owasp-security-audit` Skill + Threat Modeling & Concurrency Audit |
| `frontend-craftsman` | `Frontend` | ✨ Frontend UI Craftsman / 前端与桌面界面工匠 | Lumzel Official | Design Tokens, Accessibility & Desktop-Grade UI Polish |

## Included Decks

| ID | Category | Title (`en` / `zh-CN`) | Capabilities |
| :--- | :--- | :--- | :--- |
| `spec-workbench` | `Workflow` | Spec Workbench / 方案工作台 | Visual design docs, tickets, clickable prototypes, and 9 `spec-workbench-*` skills + 4 `spec-workbench-*` subagents |
| `pr-review-board` | `Code Review` | PR Review Board / 代码审查面板 | Dual-axis Standards & Spec code review board + 3 `pr-review-board-*` skills |
| `release-readiness` | `DevOps` | Release Readiness / 发版就绪看板 | Release checklist, changelog summary, and Agent verification gate + 3 `release-readiness-*` skills |
| `architecture-radar` | `Architecture` | Architecture Radar / 架构与模块雷达 | Module boundaries, dependency health, and Agent structural analysis + 3 `architecture-radar-*` skills |

--- | :--- | :--- | :--- |
| `everything-claude-code` | ⚡ Everything Claude Code (ECC) / 全栈工程套件 | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | 5 Skills (`ecc-plan`, `ecc-tdd-workflow`, `ecc-security-shield`, `ecc-code-review`, `ecc-verification-loop`), 6 Subagents (`ecc-planner`, `ecc-architect`, `ecc-tdd-guide`, `ecc-code-reviewer`, `ecc-security-reviewer`, `ecc-build-fixer`), 2 Rules |
| `matt-pocock` | 🎯 Matt Pocock Workflow / 研发工作流 | [`mattpocock/skills`](https://github.com/mattpocock/skills) | 14 Skills (`grill-me`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `to-spec`, `to-tickets`, `wayfinder`, `tdd`, `prototype`, `diagnosing-bugs`, `code-review`, `improve-codebase-architecture`, `handoff`, `teach`), 3 Subagents (`standards-reviewer`, `spec-reviewer`, `architecture-explorer`), 1 Rule |
| `superpowers` | 🦸 Obra Superpowers / 工程纪律套件 | [`obra/superpowers`](https://github.com/obra/superpowers) | 5 Skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `systematic-debugging`, `verification-before-completion`), 3 Subagents (`task-implementer`, `spec-compliance-reviewer`, `code-quality-reviewer`), 1 Rule (`superpowers-iron-laws`) |
| `spec-kit` | 📐 GitHub Spec-Kit (SDD) / 规格驱动开发 | [`github/spec-kit`](https://github.com/github/spec-kit) | 4 Skills (`speckit-constitution`, `speckit-specify`, `speckit-plan`, `speckit-tasks`), 2 Subagents (`spec-analyst`, `contract-architect`), 1 Rule (`spec-first-gate`) |
| `compound-engineering` | 🔄 Compound Engineering / 复利工程 | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | 3 Skills (`compound-plan`, `compound-review`, `compound-codify`), 3 Subagents (`simplicity-reviewer`, `data-integrity-reviewer`, `performance-oracle`), 1 Rule (`compound-knowledge`) |
| `gstack` | 🚀 Garry Tan gstack / 交付工作流 | [`garrytan/gstack`](https://github.com/garrytan/gstack) | 3 Skills (`gstack-ceo-plan`, `gstack-eng-plan`, `gstack-paranoid-review`), 2 Subagents (`staff-paranoid-reviewer`, `release-ship-captain`) |
| `fullstack-architect` | 🏛️ Fullstack Architect / 全栈系统架构师 | Lumzel Official | `architecture-adr` Skill + System Architecture & Boundary Instructions |
| `tdd-engineer` | 🧪 TDD Craft Engineer / TDD 测试驱动工程师 | Lumzel Official | Public Seam Red-Green-Refactor Instructions |
| `security-auditor` | 🛡️ Security & Reliability Auditor / 安全与可靠性审计师 | Lumzel Official | `security-review` Skill + Threat Modeling & Concurrency Audit |
| `frontend-craftsman` | ✨ Frontend UI Craftsman / 前端与桌面界面工匠 | Lumzel Official | Design Tokens, Accessibility & Desktop-Grade UI Polish |

## Included Decks

| ID | Title (`en` / `zh-CN`) | Category | Capabilities |
| :--- | :--- | :--- | :--- |
| `spec-workbench` | Spec Workbench / 方案工作台 | Engineering | Visual design docs, tickets, clickable prototypes, and 9 `spec-workbench-*` skills + 4 `spec-workbench-*` subagents |
| `release-readiness` | Release Readiness / 发版就绪看板 | DevOps | Release checklist, changelog summary, and Agent verification gate + 3 `release-readiness-*` skills |
| `architecture-radar` | Architecture Radar / 架构与模块雷达 | Architecture | Module boundaries, dependency health, and Agent structural analysis + 3 `architecture-radar-*` skills |
| `pr-review-board` | PR Review Board / 代码审查面板 | Engineering | Dual-axis Standards & Spec code review board + 3 `pr-review-board-*` skills |

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
   - **GitHub Tree URL**: `https://github.com/lumzel/lumzel-hub/tree/main/loadouts/everything-claude-code`
   - **Shorthand (`owner/repo/id`)**: `lumzel/lumzel-hub/everything-claude-code` or `lumzel/lumzel-hub/matt-pocock`
   - **Lumzel URI Schema**:
     - `lumzel://loadout/lumzel/lumzel-hub/everything-claude-code`
     - `lumzel://loadout/lumzel/lumzel-hub/matt-pocock`
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

## Creating Your Own Repository

1. Create a GitHub repository with `marketplace.json` at the root (or `.lumzel-plugin/marketplace.json`).
2. List your `loadouts` and/or `decks` in `marketplace.json`:

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
      "source": "./decks/incident-triage"
    }
  ]
}
```

3. In Lumzel, open **Loadout** or **Deck**, click **+ Add repository…**, and enter `https://github.com/<owner>/<repo>`.
4. Whenever you push new commits to your repository, Lumzel automatically detects the remote commit change via `git ls-remote` and shows an **Update** button on installed cards.
