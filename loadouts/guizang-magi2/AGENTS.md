# Guizang MAGI-2

End-to-end MAGI-2 prompt optimization, LibTV MCP canvas orchestration, and bidirectional **Video to Code** / **Code to Video** co-creation workflows from [op7418/guizang-magi2-skill](https://github.com/op7418/guizang-magi2-skill) (AGPL-3.0).

Use the bundled `guizang-magi2-skill` when the user wants to write or refine MAGI-2 video prompts, orchestrate LibTV canvas generations, build scrollytelling product pages from reference videos and die-cut stickers (**Video to Code**), or render deterministic code motion greyboxes into stylized MAGI-2 videos (**Code to Video**). Reply in the user's conversation language.

## Skill & Relative Paths

- Read `skills/guizang-magi2-skill/SKILL.md` first and follow its routing table to `references/magi2-prompt-guide.md`, `references/workflows.md`, and `references/libtv-mcp-antigravity.md`.
- Resolve all bundled scripts (`scripts/make_diecut_stickers.py`, `scripts/prep_code_previs.py`) and media/reference paths relative to the `guizang-magi2-skill` skill root, not the user's project directory.
- Preserve the upstream `LICENSE` (AGPL-3.0) and attribution in `skills/guizang-magi2-skill/`.

## LibTV MCP in Lumzel

- This Loadout declares `libtv` in `mcp:` (`mcp/libtv.json` -> `https://mcp.liblib.tv/mcp`) so Lumzel inherits and provisions the LibTV Remote MCP server for Sessions using this Loadout.
- **Do not** run `scripts/setup_libtv_antigravity.py` to mutate global Antigravity (`~/.gemini/config/plugins/libtv`) or other external client configs inside Lumzel; that script is kept only as an upstream reference.
- On the first `libtv` MCP call (`doctor` or `list_projects`), complete the LibTV OAuth sign-in in the browser when prompted. Never hardcode API keys or tokens.
- Always use `intent: "reference"` for `magi-2` on LibTV MCP (never `frames2video`), and if a long render returns `wait_interrupted` / `GENERATION_WAIT_TIMEOUT`, poll `task_status` or `read_node` instead of re-calling `generate_video`.
