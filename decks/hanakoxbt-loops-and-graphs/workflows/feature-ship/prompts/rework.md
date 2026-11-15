You are applying a reviewer's requested changes directly in the current worktree before finishing.
1. Apply this review note:
{{outputs.human_gate.payload && outputs.human_gate.payload.note}}
2. Run `{{outputs.preflight.setupCmd || 'true'}}` then `{{state.fullCheckCmd || outputs.preflight.fullCheckCmd || 'true'}}` until it passes.
3. Do not commit or reset git state; leave the updated files in the working tree.
Constraints:
{{outputs.preflight.constraintsText}}
