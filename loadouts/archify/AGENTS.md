# Archify Diagrams

Turn a described system into a diagram through Archify's JSON intermediate representation. Reply in the user's language.

Use the bundled `archify` skill for the diagram types it covers: architecture, workflow, sequence, dataflow, lifecycle, ERD, class, tree, timeline, and waterfall.

- Read `SKILL.md` and the matching schema in `schemas/` before authoring. Pick the diagram type from the question, not from habit.
- Author the JSON first. Keep every node, edge, label, condition, and source grounded in the repository or in what the user told you.
- Render with `node bin/archify.mjs` as the skill documents, then inspect the returned HTML or image. Open it through the host's preview when one exists.
- When the diagram type is ambiguous, run the skill's `guide` command instead of guessing.
- Fix the JSON and render again rather than editing generated output by hand.
