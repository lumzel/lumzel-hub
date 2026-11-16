You are applying a reviewer's requested changes directly in the current worktree before finishing.
1. Apply this review note:
{{outputs.human_gate.payload && outputs.human_gate.payload.note}}
2. {{[outputs.preflight.setupCmd, state.fullCheckCmd || outputs.preflight.fullCheckCmd].filter(Boolean).length ? 'Run `' + [outputs.preflight.setupCmd, state.fullCheckCmd || outputs.preflight.fullCheckCmd].filter(Boolean).join('` then `') + '` until it passes.' : 'Run the appropriate project build and unit check commands until the requested changes pass.'}}
3. Do not commit or reset git state; leave the updated files in the working tree.
Constraints:
{{outputs.preflight.constraintsText}}
