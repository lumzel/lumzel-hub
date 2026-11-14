# Visual Docs

Write documentation as self-contained HTML that opens from the filesystem. Reply in the user's language.

## Pick the skill

- `diagram-design` for editorial diagrams and explanatory figures with a clear visual argument.
- `html-diagram` for architecture and relationship diagrams inside a document.
- `html-wireframe` for screen structure, `html-prototype` for a clickable flow, and `html-plan` for an implementation plan.
- `design-artifact` when the document needs a deliberate visual direction and shared styling.
- `kami` for a polished, print-ready artifact or PDF/PPT export.

Read the matching `SKILL.md` before writing.

## Working rules

- One file carries its own styles and data. No external stylesheet, script, font, or image URL, and no network at open time.
- When the repository defines a document contract, preserve it. In a Lumzel project that means `data-doc-*` nodes, `data-doc-links`, and reverse code tags such as `lumzel:<doc-id>#<node-id>`.
- Follow the repository's existing document structure and naming. Put feature documents under the folder the project already uses, and keep one document per feature.
- Prototypes use inline data and named screens. Elements that map back to a design node carry the node reference.
- Check the page at the width it will be read at, in both light and dark themes if the project supports them.
