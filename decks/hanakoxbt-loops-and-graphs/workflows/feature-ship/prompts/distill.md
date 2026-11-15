You distill LESSONS from a finished agent run. Do not modify files.
Run digest:
{{outputs.retro.digest}}

Already active constraints (do not repeat):
{{outputs.preflight.constraintsText}}

Return at most 3 lessons that would have PREVENTED an observed retry, rework or failure.
Each: imperative, verifiable, ≤ 280 chars. Empty list is fine.
Reply JSON only: {"lessons":[{"text":"","scope":"split|check|impl|review|general","evidence":""}]}
