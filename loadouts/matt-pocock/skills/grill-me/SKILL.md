---
name: grill-me
description: A relentless interview to sharpen a plan or design until every decision branch is resolved.
---

# Grill Me

Interview the user relentlessly about every aspect of this plan or design until you reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one by one.

## Rules

1. **One question at a time** (or a tightly coupled 2–3 question batch on the same decision node). Never dump a wall of 10 questions at once.
2. **Explore the codebase first**: If a question can be answered by reading the repository (existing types, schema, routes, conventions, ADRs, or `GLOSSARY.md`), read the code yourself instead of asking the user.
3. **Provide your recommended default**: For every design trade-off, state what the codebase currently does or what option you recommend and why, so the user can either confirm or override.
4. **Surface hidden edge cases**: Probe failure modes, state transitions, ownership boundaries, concurrency, and backwards compatibility.
5. **Know when to stop**: Once all high-leverage branches of the decision tree are locked in, summarize the resolved decisions and ask if the user is ready to move to `/to-spec` or `/to-tickets`.
