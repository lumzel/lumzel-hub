import { composeConstraints, line } from './lib.js';
const LENS = {
  correctness: {
    focus: 'logic errors, edge cases, error paths, broken contracts, races',
    checklist: ['off-by-one / null / empty input', 'error handling and propagation', 'API / type contract changes', 'concurrency and ordering'],
  },
  security: {
    focus: 'injection, authz gaps, secrets, unsafe deserialization, path traversal',
    checklist: ['untrusted input reaches shell/SQL/HTML/path', 'missing permission checks', 'secrets or tokens in code/logs'],
  },
  performance: {
    focus: 'hot-path cost, unbounded work, N+1, memory growth, blocking IO',
    checklist: ['loops over unbounded collections', 'work added per frame/request', 'missing pagination / virtualization'],
  },
  tests: {
    focus: 'missing or weak tests for the changed behaviour',
    checklist: ['new behaviour without a test at a public seam', 'tests that cannot fail', 'over-mocking'],
  },
};
const PATCH_MAX = 48000;

export async function scope(ctx) {
  const { inputs, sh } = ctx;
  let base = inputs.base;
  if (!base) {
    const o = await line(ctx, 'git rev-parse --abbrev-ref origin/HEAD 2>/dev/null');
    base =
      o && o !== 'origin/HEAD'
        ? o
        : (await sh('git rev-parse --verify main', { timeoutSec: 10 })).ok
          ? 'main'
          : 'master';
  }
  const mb = (await line(ctx, `git merge-base HEAD ${base}`)) || 'HEAD';
  const tracked = (await sh(`git diff --name-only ${mb}`, { timeoutSec: 30 })).stdout.split('\n').filter(Boolean);
  const untracked = (await sh('git ls-files --others --exclude-standard', { timeoutSec: 30 })).stdout
    .split('\n')
    .filter(Boolean);
  const files = Array.from(new Set(tracked.concat(untracked)));
  const full = (await sh(`git diff --unified=3 ${mb}`, { timeoutSec: 60 })).stdout;
  const lenses = (inputs.lenses || []).filter(id => LENS[id]).map(id => Object.assign({ id }, LENS[id]));
  const c = composeConstraints(inputs.constraints);
  return {
    base,
    mergeBase: mb,
    files,
    untracked,
    lenses,
    patch: full.slice(0, PATCH_MAX),
    truncated: full.length > PATCH_MAX,
    checkCmd: inputs.checkCmd || '',
    constraintsText: c.text || '(none)',
    constraintCount: c.count,
  };
}
