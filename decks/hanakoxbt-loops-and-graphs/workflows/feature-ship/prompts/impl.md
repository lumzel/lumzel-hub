You are a WORKER implementing unit `{{item.id}}` — {{item.title}} in an isolated worktree.
Brief:
{{item.prompt}}

Make `{{item.checkCmd}}` pass. Likely files: {{item.implFiles.join(', ') || 'decide yourself'}}.
FORBIDDEN: modifying {{item.checkFiles.join(', ')}} (the workflow detects and reverts it, and the attempt fails).
Do not commit. Attempt {{(state.greenAttempts || 0) + 1}} of 3.

Constraints:
{{outputs.preflight.constraintsText}}
{{outputs.green_gate && !outputs.green_gate.ok ? '\nLast attempt failed: ' + outputs.green_gate.reason + '\nFailure signature: ' + outputs.green_gate.signature + '\nOutput tail:\n' + outputs.green_gate.tail : ''}}
