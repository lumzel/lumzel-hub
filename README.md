# Lumzel Hub (`lumzel/lumzel-hub`)

Official open-source repository of **Loadouts** and **Decks** for [Lumzel](https://github.com/lumzel/lumzel-hub).

A single repository can host both **Loadouts** (complete Agent persona + instructions + bundled skills/agents/rules/hooks/MCP) and **Decks** (interactive HTML/JS workbench panels powered by `/sdk.js`).

---

## Included Loadouts

| ID | Name | Inspired By / Upstream | Bundled Capabilities |
| :--- | :--- | :--- | :--- |
| `everything-claude-code` | ⚡ Everything Claude Code (ECC) | [`affaan-m/everything-claude-code`](https://github.com/affaan-m/everything-claude-code) | 5 Skills (`ecc-plan`, `ecc-tdd-workflow`, `ecc-security-shield`, `ecc-code-review`, `ecc-verification-loop`), 6 Subagents (`ecc-planner`, `ecc-architect`, `ecc-tdd-guide`, `ecc-code-reviewer`, `ecc-security-reviewer`, `ecc-build-fixer`), 2 Rules |
| `matt-pocock` | 🎯 Matt Pocock Workflow | [`mattpocock/skills`](https://github.com/mattpocock/skills) | 14 Skills (`grill-me`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `to-spec`, `to-tickets`, `wayfinder`, `tdd`, `prototype`, `diagnosing-bugs`, `code-review`, `improve-codebase-architecture`, `handoff`, `teach`), 3 Subagents (`standards-reviewer`, `spec-reviewer`, `architecture-explorer`), 1 Rule |
| `superpowers` | 🦸 Obra Superpowers | [`obra/superpowers`](https://github.com/obra/superpowers) | 5 Skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `systematic-debugging`, `verification-before-completion`), 3 Subagents (`task-implementer`, `spec-compliance-reviewer`, `code-quality-reviewer`), 1 Rule (`superpowers-iron-laws`) |
| `spec-kit` | 📐 GitHub Spec-Kit (SDD) | [`github/spec-kit`](https://github.com/github/spec-kit) | 4 Skills (`speckit-constitution`, `speckit-specify`, `speckit-plan`, `speckit-tasks`), 2 Subagents (`spec-analyst`, `contract-architect`), 1 Rule (`spec-first-gate`) |
| `compound-engineering` | 🔄 Compound Engineering | [`EveryInc/compound-engineering-plugin`](https://github.com/EveryInc/compound-engineering-plugin) | 3 Skills (`compound-plan`, `compound-review`, `compound-codify`), 3 Subagents (`simplicity-reviewer`, `data-integrity-reviewer`, `performance-oracle`), 1 Rule (`compound-knowledge`) |
| `gstack` | 🚀 Garry Tan gstack | [`garrytan/gstack`](https://github.com/garrytan/gstack) | 3 Skills (`gstack-ceo-plan`, `gstack-eng-plan`, `gstack-paranoid-review`), 2 Subagents (`staff-paranoid-reviewer`, `release-ship-captain`) |
| `fullstack-architect` | 🏛️ Fullstack Architect | Lumzel Official | `architecture-adr` Skill + System Architecture & Boundary Instructions |
| `tdd-engineer` | 🧪 TDD Craft Engineer | Lumzel Official | Public Seam Red-Green-Refactor Instructions |
| `security-auditor` | 🛡️ Security & Reliability Auditor | Lumzel Official | `security-review` Skill + Threat Modeling & Concurrency Audit |
| `frontend-craftsman` | ✨ Frontend UI Craftsman | Lumzel Official | Design Tokens, Accessibility & Desktop-Grade UI Polish |

---

## Repository Layout

```text
lumzel-hub/
├── marketplace.json                 # Index manifest for in-app Marketplace discovery
├── loadouts/
│   └── <loadout-id>/
│       ├── loadout.yaml             # Loadout metadata, runtime params, and library references
│       ├── AGENTS.md                # System instructions for the Loadout
│       ├── skills/<name>/SKILL.md   # Optional bundled Skills (auto-installed into Library)
│       ├── agents/<name>.md         # Optional bundled Subagents
│       ├── rules/<name>.md          # Optional bundled Rules
│       ├── hooks/<name>.json        # Optional bundled Hooks
│       └── mcp/<name>.json          # Optional bundled MCP server configs
└── decks/
    └── <deck-id>/
        ├── deck.json                # Deck manifest (id, title, icon, entry, uses, permissions)
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

## Creating Your Own Repository

1. Create a GitHub repository with `marketplace.json` at the root (or `.lumzel-plugin/marketplace.json`).
2. List your `loadouts` and/or `decks` in `marketplace.json`:

```json
{
  "name": "My Team Hub",
  "owner": { "name": "Acme Eng" },
  "loadouts": [
    {
      "id": "backend-go",
      "name": "Go Microservices Loadout",
      "icon": "🐹",
      "description": "Go service conventions, protobuf rules, and gRPC debugging skills.",
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
      "category": "SRE",
      "author": "Acme Eng",
      "source": "./decks/incident-triage"
    }
  ]
}
```

3. In Lumzel, open **Loadout** or **Deck**, click **+ Add repository…**, and enter `https://github.com/<owner>/<repo>`.
4. Whenever you push new commits to your repository, Lumzel automatically detects the remote commit change via `git ls-remote` and shows an **Update** button on installed cards.
