---
name: architecture-radar-dataflow
description: Trace end-to-end request, event, and state dataflow from entry points through domain services to persistence and external boundaries.
disable-model-invocation: true
---

# Architecture Dataflow Trace

Trace how critical data and control flow move through the system from external entry points to storage or side effects.

## Procedure

1. **Identify Entry & Exit Seams**: Locate primary entry points (HTTP routes, IPC commands, CLI handlers, UI stores, event listeners) and persistence/external sinks (databases, filesystem paths, network clients, subprocesses).
2. **Walk the Call Chain**: Follow 1–3 core workflows end to end, noting data transformations, validation boundaries, state ownership, concurrency locks, and error propagation at each hop.
3. **Spot Fragile Hops**: Flag duplicated state sources of truth, unvalidated trust transitions, silent error swallowing, or chatty N+1 boundary crossings with exact `file:line` citations.
4. **Visual Summary**: Present each traced flow as a clear sequence/flow diagram paired with key symbols and files.
