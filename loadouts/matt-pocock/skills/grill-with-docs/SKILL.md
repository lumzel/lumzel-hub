---
name: grill-with-docs
description: Interview the user to sharpen a plan while grounding every question in external documentation and repo ADRs.
---

# Grill With Docs

Conduct a relentless design interview (`grill-me`), grounded in both the codebase (`GLOSSARY.md`, ADRs, existing modules) and authoritative external documentation for any libraries, protocols, or APIs involved.

## Process

1. **Ground in docs first**: Before asking the user how an external API, SDK, or library should behave, verify its actual capabilities and constraints from documentation.
2. **Walk the decision tree**: Resolve architectural, data-model, and interface boundary (seam) questions one branch at a time.
3. **Challenge assumptions with evidence**: If the proposed plan conflicts with an existing ADR or library constraint, cite the source and present concrete alternatives.
4. **Lock in the spec**: Conclude with a crisp summary of agreed interfaces, seams, and out-of-scope items ready for `/to-spec`.
