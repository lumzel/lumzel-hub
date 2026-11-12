---
name: spec-workbench-tdd
description: Test-driven development in vertical slices, tied to Visual Doc Nodes. Use when building a feature or fixing a bug test-first, or the user mentions red-green, TDD, or 先写测试.
---

# Test-driven development

When the project has a `GLOSSARY.md`, read it so test names use the domain language.

## Seams first

A **seam** is the public interface where you observe behavior without reaching inside. Before any test, list the seams you will test, one line each on what it catches and misses, and confirm them with the user. Prefer existing seams and the highest one possible. No test at an unconfirmed seam.

## The loop

One slice = one Node (or part of one).

1. **Red.** Write one failing test at a confirmed seam. Name it after the behavior: "cached invoice is returned without a DB read".
2. **Green.** Write only enough code to pass. Tag the main symbol with `// lumzel:<doc-id>#<node-id>`.
3. Add the test file to the Node's `links` as `test:<path>`.
4. Repeat for the next slice. Do not write tests ahead.

## Good tests

- Verify behavior through public interfaces; they survive refactors.
- Expected values come from an independent source (a literal, a worked example, the spec), never recomputed the way the code does.
- Mock only at system boundaries (network, clock, third-party), never internal collaborators.

Refactoring is not part of the loop. It belongs to review.
