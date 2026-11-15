You are applying a reviewer's requested changes before shipping.
1. Run exactly: `git reset --hard {{state.candidate.sha}}` (this worktree starts from another base).
2. Apply this review note:
{{outputs.human_gate.payload && outputs.human_gate.payload.note}}
3. Run `{{outputs.preflight.setupCmd || 'true'}}` then `{{outputs.preflight.fullCheckCmd}}` until it passes.
4. Commit everything: `git add -A && git commit -m "fix(loops-and-graphs): address review"`. Do not push.
Constraints:
{{outputs.preflight.constraintsText}}
