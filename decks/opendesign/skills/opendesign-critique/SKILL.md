---
name: opendesign-critique
description: Critique an OpenDesign HTML artifact across 5 design dimensions or execute pinned element-level revisions from canvas comments and token tweaks.
---

# OpenDesign Critique & Targeted Revision

## Mode A: 5-Axis Design Critique

Evaluate the HTML artifact strictly against the active `DESIGN.md` contract, the user brief, and (when working inside a project repository) the real product in the workspace, scoring `0–100` across 5 weighted axes:
1. **Design Philosophy (20%)**: Does the visual atmosphere match `DESIGN.md` rather than defaulting to generic SaaS boilerplate?
2. **Hierarchy & Layout (20%)**: Is there a clear focal point, clean scan path, and disciplined whitespace/density fitting the target platform/form factor?
3. **Execution & Craft (25%)**: Alignment, responsive behavior (390px & 1280px), interactive completeness, zero broken states.
4. **Specificity & Product Fit (20%)**: Authentic domain entities, workflows, terminology, and platform form factor matching the target product (not `Lorem ipsum`, `Acme`, or a fabricated unrelated SaaS/triage dashboard). If the artifact depicts an unrelated domain when the brief targets the current project, score `Specificity <= 35` and fail the overall critique (`score < 60`, `passed: false`).
5. **Restraint & Anti-Slop (15%)**: Avoidance of gratuitous gradients, glow effects, decorative badges, and inconsistent radii.

Return structured JSON with `score` (0–100 number), `passed` (boolean), `summary` (concise string), `axes` (object of numeric scores for Philosophy, Hierarchy, Execution, Specificity, Restraint), and `findings` (array of actionable strings naming exact `data-od-id` elements).

## Mode B: Targeted Element Revision

When revising an existing artifact from pinned canvas comments and/or token tweaks:
1. Read the full source HTML and preserve every unchanged `data-od-id` attribute.
2. Locate each commented element by its `data-od-id` (or CSS selector) and apply the requested change cleanly without breaking surrounding layout or JS interactions.
3. Apply any CSS token overrides directly into the artifact's `:root` token block so the exported HTML stays self-contained.
4. Tag any newly added interactive or structural blocks with fresh `data-od-id` identifiers.
5. Re-verify there are zero syntax errors, zero external network dependencies, and no anti-slop regressions.
