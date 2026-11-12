---
name: graphify-memory
description: Persistent codebase architecture and module-relationship memory powered by Graphify (graphify-out/).
---

## Graphify Knowledge Graph & Project Memory Rules

- Treat `graphify-out/` as persistent architectural and structural memory for the project.
- When answering questions about architecture, call flows, module boundaries, or cross-file relationships and `graphify-out/graph.json` exists, query the `graphify` MCP tools (`query_graph`, `shortest_path`, `get_node`) or CLI (`graphify query "<question>"`) first instead of scanning the entire repository blindly.
- If `graphify-out/wiki/index.md` exists, consult the wiki index first for community-level orientation.
- After making substantial structural edits to core modules in a repository that already tracks `graphify-out/`, run `graphify update .` to keep the knowledge graph synchronized (deterministic AST pass for code, zero LLM API cost).
