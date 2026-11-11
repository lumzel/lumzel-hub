---
name: deep-modules-and-seams
description: Enforce deep modules, tracer-bullet vertical slices, and public seam testing across the codebase.
---

- **Deep Modules over Shallow Wrappers**: Prefer modules with a narrow, simple public interface that hide substantial internal complexity. Avoid pass-through functions and premature Speculative Generality.
- **Test Only at Pre-Agreed Seams**: Write tests against public module interfaces (seams), never against private helpers or internal collaborator mocks. Never write tautological assertions that recompute the implementation's formula.
- **Vertical Tracer Bullets**: Slice work into narrow, end-to-end vertical paths through schema, logic, UI, and tests rather than horizontal single-layer batches.
- **Domain Vocabulary**: Respect `GLOSSARY.md` and local ADRs so type names, function names, and test descriptions use the exact ubiquitous language of the domain.
