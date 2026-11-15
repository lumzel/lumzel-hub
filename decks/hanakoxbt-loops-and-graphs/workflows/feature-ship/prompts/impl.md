You are a WORKER implementing unit `{{item.id}}` — {{item.title}} in the current worktree.
Brief:
{{item.prompt}}

Make `{{item.checkCmd}}` pass. Likely files: {{item.implFiles.join(', ') || 'decide yourself'}}.
{{item.checkFiles && item.checkFiles.length ? 'FORBIDDEN: modifying ' + item.checkFiles.join(', ') + ' (the workflow hashes checkFiles after redCheck and fails the attempt if their contents change).\n' : ''}}Do not run git commit; leave changes in the working tree. Attempt {{(state.greenAttempts || 0) + 1}} of 3.

Constraints:
{{outputs.preflight.constraintsText}}
{{outputs.green_gate && !outputs.green_gate.ok ? '\nLast attempt failed: ' + outputs.green_gate.reason + '\nFailure signature: ' + outputs.green_gate.signature + '\nOutput tail:\n' + outputs.green_gate.tail : ''}}
