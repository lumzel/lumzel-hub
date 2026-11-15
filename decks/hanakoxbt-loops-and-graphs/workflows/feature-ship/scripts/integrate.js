import { parseNumstat, safeMessage, tail, line, tel } from './lib.js';

const RULES = [
  [/(^|\/)(migrations?|schema)\/|\.sql$/i, 'high', 'schema / migration changes'],
  [/(^|\/)(auth|security|crypto|permissions?|secrets?)(\/|\.|_)/i, 'high', 'security-sensitive path'],
  [/(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|uv\.lock|go\.sum)$/, 'medium', 'dependency lockfile changed'],
  [/^\.github\/|\.gitlab-ci|Dockerfile|^\.circleci\//, 'medium', 'CI / build config changed'],
];
const RANK = { low: 0, medium: 1, high: 2 };
export function assessRisk(ns, extra) {
  const flags = [];
  for (const [re, level, label] of RULES) {
    const hit = ns.files.filter(f => re.test(f.path)).map(f => f.path);
    if (hit.length) flags.push({ level, label, paths: hit.slice(0, 5) });
  }
  if (ns.deletions > 300) flags.push({ level: 'medium', label: `large deletion (−${ns.deletions})` });
  if (ns.files.length > 40) flags.push({ level: 'medium', label: `${ns.files.length} files changed` });
  for (const f of extra) flags.push(f);
  const level = flags.reduce((m, f) => (RANK[f.level] > RANK[m] ? f.level : m), 'low');
  return { level, flags };
}

async function runCheck(ctx) {
  const pre = ctx.outputs.preflight;
  if (pre.setupCmd) {
    const s = await ctx.sh(pre.setupCmd, { timeoutSec: 900 });
    if (!s.ok) return { ok: false, reason: 'setup failed', tail: tail(s.stdout + '\n' + s.stderr) };
  }
  if (!pre.fullCheckCmd) return { ok: false, reason: 'no full check command', tail: '' };
  const c = await ctx.sh(pre.fullCheckCmd, { timeoutSec: 1800 });
  return { ok: c.ok, reason: c.ok ? '' : 'full check failed', code: c.code, tail: tail(c.stdout + '\n' + c.stderr) };
}

export async function integrate(ctx) {
  const { outputs, state, sh } = ctx;
  const results = (outputs.units && outputs.units.results) || [];
  const passed = results.filter(r => r && r.ok && r.branch);
  const failed = results
    .filter(r => r && !r.ok)
    .map(r => ({
      id: r.item && r.item.id,
      error: r.error || '',
      retries: r.retries || 0,
      attempts: (r.outputs && r.outputs.green_gate && r.outputs.green_gate.attempt) || 0,
      phase: r.outputs && r.outputs.red_gate && r.outputs.red_gate.ok ? 'green' : 'red',
    }));
  const branch = await line(ctx, 'git rev-parse --abbrev-ref HEAD');
  const baseSha = await line(ctx, 'git rev-parse HEAD');
  const merged = [];
  const conflicted = [];
  for (const p of passed) {
    const m = await sh(`git merge --no-ff --no-edit -m "merge(${p.item.id})" ${p.branch}`, { timeoutSec: 300 });
    if (m.ok) merged.push({ id: p.item.id, branch: p.branch });
    else {
      await sh('git merge --abort', { timeoutSec: 60 });
      conflicted.push({ id: p.item.id, branch: p.branch, tail: tail(m.stdout + '\n' + m.stderr, 20) });
    }
    tel(ctx, p.item.id, 'merge', m.ok ? 'pass' : 'fail', 0, m.ok ? '' : 'conflict');
  }
  const check = merged.length ? await runCheck(ctx) : { ok: false, reason: 'no unit passed', tail: '' };
  const ns = parseNumstat((await sh(`git diff --numstat ${baseSha}..HEAD`, { timeoutSec: 60 })).stdout);
  for (const m of merged) await sh(`git branch -D ${m.branch}`, { timeoutSec: 30 });
  const extra = [];
  if (!check.ok) extra.push({ level: 'high', label: `full check: ${check.reason}` });
  if (conflicted.length) extra.push({ level: 'medium', label: `${conflicted.length} unit(s) excluded by merge conflict` });
  if (failed.length) extra.push({ level: 'low', label: `${failed.length} unit(s) failed after bounded retries — excluded` });
  const risk = assessRisk(ns, extra);
  const sha = await line(ctx, 'git rev-parse HEAD');
  state.candidate = {
    source: 'integrate',
    round: 0,
    branch,
    sha,
    baseSha,
    passed: merged.length,
    total: results.length,
    checkOk: check.ok,
    checkReason: check.reason,
    checkTail: check.tail,
    checkCmd: outputs.preflight.fullCheckCmd,
    filesChanged: ns.files.length,
    insertions: ns.insertions,
    deletions: ns.deletions,
    files: ns.files.sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 12),
    risk,
    mergeMessage: safeMessage(`feat(loops-and-graphs): ${state.slug || 'ship'}`),
  };
  state.branches = [branch].concat(conflicted.map(c => c.branch));
  return { shippable: merged.length > 0 && check.ok, merged, conflicted, failed, check, risk, branch, sha };
}

export async function reverify(ctx) {
  const { outputs, state, sh } = ctx;
  const c = state.candidate;
  const round = (state.reworks || 0) + 1;
  state.reworks = round;
  const rb = outputs.rework && outputs.rework.branch;
  const own = await line(ctx, 'git rev-parse --abbrev-ref HEAD');
  state.branches = (state.branches || []).concat([own]);
  if (!rb) return { ok: false, round, reason: 'rework produced no branch' };
  state.branches.push(rb);
  if (!(await sh(`git merge-base --is-ancestor ${c.sha} ${rb}`, { timeoutSec: 30 })).ok) {
    return { ok: false, round, reason: 'rework is not based on the candidate commit — ignored' };
  }
  await sh(`git reset --hard ${rb}`, { timeoutSec: 60 });
  const sha = await line(ctx, 'git rev-parse HEAD');
  if (sha === c.sha) return { ok: false, round, reason: 'rework made no commit' };
  const check = await runCheck(ctx);
  const ns = parseNumstat((await sh(`git diff --numstat ${c.baseSha}..HEAD`, { timeoutSec: 60 })).stdout);
  const extra = check.ok ? [] : [{ level: 'high', label: `full check after rework: ${check.reason}` }];
  state.candidate = Object.assign({}, c, {
    source: 'rework',
    round,
    branch: rb,
    sha,
    checkOk: check.ok,
    checkReason: check.reason,
    checkTail: check.tail,
    filesChanged: ns.files.length,
    insertions: ns.insertions,
    deletions: ns.deletions,
    files: ns.files.sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 12),
    risk: assessRisk(ns, extra),
  });
  return { ok: check.ok, round, branch: rb, sha, check };
}
