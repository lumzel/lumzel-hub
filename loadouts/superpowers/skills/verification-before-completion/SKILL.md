---
name: verification-before-completion
description: Enforce evidence before claims—always run the actual verification command and read its fresh output before stating any work is complete.
---

# Verification Before Completion

**The Iron Law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

## The Gate Function

Before saying tests pass, a build succeeds, or a bug is fixed:
1. **IDENTIFY**: Which exact command proves this claim?
2. **RUN**: Execute the full command right now (not from an earlier turn, not a partial guess).
3. **READ**: Inspect the complete output and exit code.
4. **VERIFY**: Does the actual output confirm the claim with 0 errors and 0 failures?
5. **CLAIM**: Report the result with the concrete command output as evidence.

Never say "should work now", "probably passes", or "looks good" without running the verification command.
