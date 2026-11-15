import { tel, tail, parseNumstat, line } from './lib.js';
const ENV_FAIL = /command not found|Cannot find module|ERR_MODULE_NOT_FOUND|ENOENT|No such file or directory|could not find `Cargo\.toml`|No module named/i;
const SIG = /(FAIL|✗|×|panicked at|AssertionError|Error:|expected .* received|assert)/i;

export function laneStart(ctx) {
  tel(ctx, ctx.item.id, 'start', 'info', 0, ctx.item.title);
  return { unit: ctx.item.id, startedAt: Math.floor(Date.now() / 1000) };
}

export async function redCheck(ctx) {
  const { item, outputs, state, sh } = ctx;
  const a = (state.redAttempts || 0) + 1;
  state.redAttempts = a;
  const r = outputs.verify_red || {};
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const wrote = (await sh('git status --porcelain=v1', { timeoutSec: 30 })).stdout.trim().length > 0;
  let ok = true;
  let reason = '';
  if (!wrote) {
    ok = false;
    reason = 'no check files were written';
  } else if (r.ok) {
    ok = false;
    reason = 'check passes before implementation — it does not test the new behaviour';
  } else if (r.code === 126 || r.code === 127 || ENV_FAIL.test(out)) {
    ok = false;
    reason = 'check failed for an environment reason (see setupCmd), not a missing behaviour';
  }
  tel(ctx, item.id, 'red', ok ? 'pass' : 'fail', a, reason);
  return { ok, reason, attempt: a, max: 2, code: r.code, tail: tail(out) };
}

export async function greenCheck(ctx) {
  const { item, outputs, state, sh } = ctx;
  const a = (state.greenAttempts || 0) + 1;
  state.greenAttempts = a;
  const r = outputs.verify_green || {};
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const files = item.checkFiles.map(f => `'${f}'`).join(' ');
  const touched = (await sh(`git diff --name-only HEAD -- ${files}`, { timeoutSec: 30 })).stdout
    .split('\n')
    .filter(Boolean);
  if (touched.length) await sh(`git checkout HEAD -- ${files}`, { timeoutSec: 30 });
  const ok = !!r.ok && touched.length === 0;
  const reason = touched.length
    ? `implementation modified check files: ${touched.join(', ')}`
    : r.ok
      ? ''
      : 'check still failing';
  const sigLine = stripLines(out).find(l => SIG.test(l)) || '';
  tel(ctx, item.id, 'green', ok ? 'pass' : 'fail', a, reason || sigLine);
  return { ok, reason, attempt: a, max: 3, signature: sigLine.slice(0, 200), tail: tail(out) };
}
const stripLines = s =>
  String(s)
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

export async function unitReport(ctx) {
  const { item, state } = ctx;
  const sha = await line(ctx, 'git rev-parse HEAD');
  const ns = parseNumstat((await ctx.sh('git diff --numstat HEAD~2..HEAD', { timeoutSec: 30 })).stdout);
  tel(ctx, item.id, 'done', 'pass', state.greenAttempts || 1, sha.slice(0, 7));
  return {
    unit: item.id,
    sha,
    files: ns.files,
    insertions: ns.insertions,
    deletions: ns.deletions,
    attempts: state.greenAttempts || 1,
    redAttempts: state.redAttempts || 1,
  };
}
