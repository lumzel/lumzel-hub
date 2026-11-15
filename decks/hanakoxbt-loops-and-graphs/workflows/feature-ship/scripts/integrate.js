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

function resolveFullCheckCmd(ctx) {
  const { inputs, outputs, state } = ctx;
  return (
    String((inputs && inputs.fullCheckCmd) || '').trim() ||
    String((state && state.fullCheckCmd) || '').trim() ||
    String((outputs && outputs.plan && outputs.plan.fullCheckCmd) || '').trim() ||
    String((outputs && outputs.preflight && outputs.preflight.fullCheckCmd) || '').trim()
  );
}

async function runCheck(ctx) {
  const pre = (ctx.outputs && ctx.outputs.preflight) || {};
  if (pre.setupCmd) {
    const s = await ctx.sh(pre.setupCmd, { timeoutSec: 900 });
    if (!s.ok) return { ok: false, skipped: false, reason: 'setup failed', tail: tail(s.stdout + '\n' + s.stderr) };
  }
  const cmd = resolveFullCheckCmd(ctx);
  if (!cmd) {
    return { ok: true, skipped: true, reason: 'no full check command configured', cmd: '', tail: '' };
  }
  const c = await ctx.sh(cmd, { timeoutSec: 1800 });
  return {
    ok: c.ok,
    skipped: false,
    reason: c.ok ? '' : 'full check failed',
    cmd,
    code: c.code,
    tail: tail(c.stdout + '\n' + c.stderr),
  };
}

async function collectWorkingTreeDiff(ctx, sh) {
  const ns = parseNumstat((await sh('git -c core.quotePath=false diff --numstat HEAD', { timeoutSec: 60 })).stdout);
  const stOut = (await sh('git -c core.quotePath=false status --porcelain=v1 -uall', { timeoutSec: 30 })).stdout;
  const seen = new Set(ns.files.map(f => f.path));
  for (const rawLine of stOut.split('\n')) {
    if (!rawLine.startsWith('?? ')) continue;
    const p = rawLine.slice(3).trim();
    if (!p || p.startsWith('.lumzel/') || seen.has(p)) continue;
    const content = ctx.fsReadOrEmpty(p);
    const lines = content ? content.split('\n').length : 0;
    ns.files.push({ path: p, add: lines, del: 0 });
    ns.insertions += lines;
  }
  return ns;
}

export async function integrate(ctx) {
  const { outputs, state, sh } = ctx;
  const results = (outputs.units && outputs.units.results) || [];
  const passed = results.filter(r => r && r.ok);
  const failed = results
    .filter(r => r && !r.ok)
    .map(r => ({
      id: r.item && r.item.id,
      error: r.error || '',
      retries: r.retries || 0,
      attempts: (r.outputs && r.outputs.green_gate && r.outputs.green_gate.attempt) || 0,
      phase: r.outputs && r.outputs.red_gate && r.outputs.red_gate.ok === false ? 'red' : 'green',
    }));
  const branch = await line(ctx, 'git rev-parse --abbrev-ref HEAD');
  const sha = await line(ctx, 'git rev-parse HEAD');
  const merged = passed.map(p => ({ id: p.item.id }));
  const check = passed.length ? await runCheck(ctx) : { ok: false, skipped: false, reason: 'no unit passed', cmd: '', tail: '' };
  const ns = await collectWorkingTreeDiff(ctx, sh);
  const extra = [];
  if (!check.ok) extra.push({ level: 'high', label: `full check: ${check.reason}` });
  else if (check.skipped) extra.push({ level: 'medium', label: 'no full check command — verified by per-unit checks only' });
  if (failed.length) extra.push({ level: 'low', label: `${failed.length} unit(s) failed after bounded retries — excluded` });
  const risk = assessRisk(ns, extra);
  state.candidate = {
    source: 'integrate',
    round: 0,
    branch,
    sha,
    baseSha: sha,
    passed: passed.length,
    total: results.length,
    checkOk: check.ok,
    checkSkipped: !!check.skipped,
    checkReason: check.reason,
    checkTail: check.tail,
    checkCmd: check.cmd || resolveFullCheckCmd(ctx),
    filesChanged: ns.files.length,
    insertions: ns.insertions,
    deletions: ns.deletions,
    files: ns.files.sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 12),
    risk,
    mergeMessage: safeMessage(`feat(loops-and-graphs): ${state.slug || 'ship'}`),
  };
  state.branches = [];
  return { shippable: passed.length > 0 && check.ok, merged, conflicted: [], failed, check, risk, branch, sha };
}

export async function reverify(ctx) {
  const { state, sh } = ctx;
  const c = state.candidate || {};
  const round = (state.reworks || 0) + 1;
  state.reworks = round;
  const branch = await line(ctx, 'git rev-parse --abbrev-ref HEAD');
  const sha = await line(ctx, 'git rev-parse HEAD');
  const check = await runCheck(ctx);
  const ns = await collectWorkingTreeDiff(ctx, sh);
  const extra = !check.ok
    ? [{ level: 'high', label: `full check after rework: ${check.reason}` }]
    : check.skipped
      ? [{ level: 'medium', label: 'no full check command — verified by per-unit checks only' }]
      : [];
  state.candidate = Object.assign({}, c, {
    source: 'rework',
    round,
    branch,
    sha,
    checkOk: check.ok,
    checkSkipped: !!check.skipped,
    checkReason: check.reason,
    checkTail: check.tail,
    checkCmd: check.cmd || c.checkCmd || resolveFullCheckCmd(ctx),
    filesChanged: ns.files.length,
    insertions: ns.insertions,
    deletions: ns.deletions,
    files: ns.files.sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 12),
    risk: assessRisk(ns, extra),
  });
  return { ok: check.ok, round, branch, sha, check };
}
