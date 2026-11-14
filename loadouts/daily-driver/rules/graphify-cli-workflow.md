---
name: graphify-cli-workflow
description: 'Query and maintain an existing project knowledge graph with Graphify CLI; do not use Graphify MCP.'
---

# Graphify CLI Workflow

- Use the local `graphify` CLI, not Graphify MCP. This Loadout's CLI-only rule
  also applies when the upstream Graphify skill describes optional MCP exports.
- For questions about code, architecture, file relationships, or project
  content, check for `graphify-out/graph.json`. When it exists, start with
  `graphify query "<question>"` before broad source searches. Use `graphify path`
  and `graphify explain` for focused relationships, then inspect the relevant
  source when graph context is insufficient.
- If `graphify-out/wiki/index.md` exists, read its index for navigation. Do not
  load the full graph or report for a narrow lookup.
- Do not initialize or rebuild a graph for an ordinary question. Build a new
  graph only when the user requests it. Without a graph or an available CLI,
  continue with targeted source inspection and explain the limitation briefly.
- After source edits, `graphify-cli-sync-after-edit` refreshes an existing graph
  with `graphify update .` when the CLI is available. If a harness does not fire
  that Hook for its editing tool, run the CLI refresh once after the edit batch.
  Skip a duplicate refresh when the Hook already completed it.
- If a refresh fails, continue the user's work and report that the graph may be
  stale. Do not change permissions, install dependencies, or create a graph
  merely to satisfy the Hook.
