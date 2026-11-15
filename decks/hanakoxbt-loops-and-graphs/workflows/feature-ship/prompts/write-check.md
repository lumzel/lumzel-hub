You are a CHECK WRITER working in the current worktree for unit `{{item.id}}` — {{item.title}}.
Goal: {{item.goal}}

Write ONLY failing acceptance tests in: {{item.checkFiles.join(', ')}}
- Do NOT touch implementation files ({{item.implFiles.join(', ') || 'none listed'}}).
- The command `{{item.checkCmd}}` must FAIL now because the behaviour is missing — not because of syntax
  errors, missing imports of test tooling, or a wrong path.
- Do not run git commit; leave changes in the working tree for verification.

Constraints:
{{outputs.preflight.constraintsText}}
{{outputs.red_gate && !outputs.red_gate.ok ? '\nPrevious attempt was rejected: ' + outputs.red_gate.reason + '\nOutput tail:\n' + outputs.red_gate.tail : ''}}
