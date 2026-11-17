import { tel, tail, parseNumstat, line, fnv1a, shQuote, safeReadText } from './lib.js';
const ENV_FAIL = /command not found|Cannot find module|ERR_MODULE_NOT_FOUND|could not find `Cargo\.toml`|No module named|executable not found/i;
const SIG = /(FAIL|✗|×|panicked at|AssertionError|Error:|expected .* received|assert)/i;

export function laneStart(ctx) {
  tel(ctx, ctx.item.id, 'start', 'info', 0, ctx.item.title);
  if (ctx.item.mode === 'verify' || !ctx.item.checkFiles || !ctx.item.checkFiles.length) {
    tel(ctx, ctx.item.id, 'red_skip', 'info', 0, 'verify-only unit');
  }
  return { unit: ctx.item.id, mode: ctx.item.mode || 'tdd', startedAt: Math.floor(Date.now() / 1000) };
}

export async function redCheck(ctx) {
  const { item, outputs, state, sh } = ctx;
  const a = (state.redAttempts || 0) + 1;
  state.redAttempts = a;
  const r = outputs.verify_red || {};
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  let wrote = Array.isArray(item.checkFiles) && item.checkFiles.length > 0;
  if (wrote) {
    for (const f of item.checkFiles) {
      if (!(await sh(`test -e ${shQuote(f)}`, { timeoutSec: 5 })).ok) {
        wrote = false;
        break;
      }
    }
  }
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
  if (ok) {
    const pinned = {};
    for (const f of item.checkFiles) {
      pinned[f] = fnv1a(safeReadText(ctx, f));
    }
    state.pinnedCheckHashes = pinned;
  }
  tel(ctx, item.id, 'red', ok ? 'pass' : 'fail', a, reason);
  return { ok, reason, attempt: a, max: 2, code: r.code, tail: tail(out) };
}

export async function greenCheck(ctx) {
  const { item, outputs, state } = ctx;
  const a = (state.greenAttempts || 0) + 1;
  state.greenAttempts = a;
  const r = outputs.verify_green || {};
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const pinned = state.pinnedCheckHashes || {};
  const touched = [];
  for (const f of item.checkFiles || []) {
    if (pinned[f] !== undefined && fnv1a(safeReadText(ctx, f)) !== pinned[f]) {
      touched.push(f);
    }
  }
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
  const paths = [...(item.checkFiles || []), ...(item.implFiles || [])].map(shQuote).join(' ');
  const diffCmd = paths ? `git diff --numstat HEAD -- ${paths}` : 'git diff --numstat HEAD';
  const ns = parseNumstat((await ctx.sh(diffCmd, { timeoutSec: 30 })).stdout);
  tel(ctx, item.id, 'done', 'pass', state.greenAttempts || 1, sha.slice(0, 7));
  return {
    unit: item.id,
    sha,
    files: ns.files,
    insertions: ns.insertions,
    deletions: ns.deletions,
    attempts: state.greenAttempts || 1,
    redAttempts: state.redAttempts || 0,
  };
}
