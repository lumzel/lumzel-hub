---
name: systematic-debugging
description: Four-phase root-cause debugging methodology that forbids guessing or patching symptoms before reproducing and proving the root cause.
---

# Systematic Debugging

**The Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Never apply a "quick fix" or guess at a symptom. Follow the 4 phases in strict order:

## Phase 1: Root Cause Investigation
1. Read error messages and stack traces completely.
2. Reproduce the issue consistently with a minimal command or test case.
3. Check recent changes (`git diff`, `git log`).
4. In multi-component systems, trace data flow across every component boundary to find the exact layer where valid input becomes invalid state.

## Phase 2: Pattern Analysis
1. Find working examples of similar code in the repository.
2. Compare working vs. broken paths line by line and list every difference.

## Phase 3: Hypothesis & Scientific Testing
1. Form a single, falsifiable hypothesis: *"I think X is the root cause because Y."*
2. Test it with the smallest possible change or diagnostic log, one variable at a time.

## Phase 4: Implementation & Regression Test
1. Write an automated failing test that reproduces the bug.
2. Fix the root cause (not the symptom) with a single clean change.
3. If 3 fix attempts fail, **STOP**: question the architectural assumption with the user instead of stacking workarounds.
