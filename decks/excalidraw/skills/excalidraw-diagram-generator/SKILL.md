---
name: excalidraw-diagram-generator
description: "Generate or revise .excalidraw JSON diagram files from natural language descriptions or codebase context. Supports flowcharts, architecture diagrams, sequence diagrams, ER diagrams, data flow diagrams (DFD), swimlane workflows, class diagrams, relationship graphs, and mind maps."
---

# Excalidraw Diagram Generator

Generate or update clean, valid `.excalidraw` (version 2) JSON files in the active workspace so they open directly in the Excalidraw Studio Deck.

## Core Workflow

1. **Determine Target & Intent**:
   - Inspect whether the request asks to **create** a new `.excalidraw` file or **revise/extend** an existing `.excalidraw` file at a specified path.
   - If the request specifies a target folder (e.g. `diagrams/<id>.excalidraw`) without a fixed filename, choose a concise, descriptive kebab-case ID matching the topic (e.g. `oauth-token-flow`) without overwriting existing diagrams.
   - When revising an existing file, read the current `.excalidraw` JSON first so you preserve existing element IDs, layout, and user-drawn elements unless the request explicitly asks to replace or remove them.
   - If the request references codebase modules, APIs, or docs, read the relevant files first so every node and edge reflects real symbols and paths rather than generic placeholders.

2. **Choose Diagram Structure & Language**:
   - Supported types: **Architecture**, **Flowchart**, **Sequence**, **ER Diagram**, **Data Flow (DFD)**, **Business Swimlane**, **Class Diagram**, **Relationship Graph**, **Mind Map**.
   - Author all diagram text labels, titles, and annotations in the **same language as the user's prompt** (e.g., Chinese when prompted in Chinese, English when prompted in English).

3. **Layout & Visual Rules**:
   - **No overlaps**: Leave generous spacing (`180–280px` horizontal gap, `90–140px` vertical gap) and size containers dynamically to fit text (`fontSize >= 16`, ideally `16–20` for node labels and `24–28` for diagram titles).
   - **Font**: Set `fontFamily: 5` (Excalifont) on all text elements for consistent hand-drawn rendering.
   - **Bound text inside shapes**: When labeling a `rectangle`, `ellipse`, or `diamond`, either bind the `text` element (`containerId` pointing to the shape `id`, and shape `boundElements` listing `{ "id": textId, "type": "text" }`) or center it cleanly with matching width/height.
   - **Arrows & bindings**: Set `points: [[0, 0], [dx, dy]]` relative to the arrow's `(x, y)` origin, and wire `startBinding` / `endBinding` (`{ "elementId": targetId, "focus": 0, "gap": 6 }`) plus `boundElements: [{ "id": arrowId, "type": "arrow" }]` on connected shapes so arrows stay attached when the user drags nodes manually.
   - **Consistent palette**:
     - Primary / core: `#a5d8ff` fill, `#1971c2` stroke
     - Secondary / service: `#b2f2bb` fill, `#2f9e44` stroke
     - Highlight / decision / store: `#ffec99` fill, `#f08c00` stroke
     - Warning / external / alert: `#ffc9c9` fill, `#e03131` stroke
     - Neutral frame / group: `#f1f3f5` fill, `#868e96` stroke
   - **Keep diagrams readable**: Aim for `6–25` meaningful nodes per diagram; split overly dense systems into focused sub-diagrams if needed.

4. **Valid Excalidraw v2 Output**:
   Write valid JSON directly to the target `.excalidraw` file path:
   ```json
   {
     "type": "excalidraw",
     "version": 2,
     "source": "https://excalidraw.com",
     "elements": [],
     "appState": {
       "viewBackgroundColor": "#ffffff",
       "gridSize": 20
     },
     "files": {}
   }
   ```
   - Ensure every element has a unique string `id`, valid numeric `x`, `y`, `width`, `height`, `seed`, `version: 1`, `versionNonce`, `isDeleted: false`, `roughness: 1`, `opacity: 100`.
   - Validate JSON syntax before finishing (never leave comments, trailing commas, or unescaped quotes).

5. **Bundled References & Templates**:
   - Schema details: `references/excalidraw-schema.md`
   - Element specs: `references/element-types.md`
   - Starter templates: `templates/*.excalidraw`
   - Helper scripts (optional): `scripts/add-arrow.py`, `scripts/add-icon-to-diagram.py`
