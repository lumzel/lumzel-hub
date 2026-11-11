---
name: gstack-eng-plan
description: Lock in system architecture, state machines, data flow diagrams, failure modes, and test matrices like a pragmatic Staff Eng Manager.
---

# gstack Engineering Manager Review (`/plan-eng-review`)

Once product direction is clear, lock down technical execution with crisp diagrams and explicit edge-case coverage:

1. **Architecture & State Machine**:
   - Draw the ASCII/Mermaid state transition diagram and data flow across UI, IPC/API, and storage.
2. **Failure Mode & Rescue Matrix**:
   - For every external call or state transition, list what can fail, how it is surfaced, and whether retries are idempotent.
3. **Test Matrix**:
   - Enumerate the exact unit, integration, and UI interaction paths to verify.
