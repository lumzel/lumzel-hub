import { slugify, safeMessage, safePath, tel } from './lib.js';
const CONTROL_CHARS = /[\0\r\n]/;
const NOOP_PART = '(?:true|:|exit(?:\\s+\\d+)?|echo(?:\\s+[^;&|]*)?)';
const NOOP_CMD = new RegExp(`^${NOOP_PART}(?:\\s*(?:&&|\\|\\||;)\\s*${NOOP_PART})*$`, 'i');
const DANGEROUS_CMD =
  /(?:^|[;&|(`]\s*|\$\(\s*)(?:rm\s+(?:-[a-z]*[rf][a-z]*\s+)*(?:\/+\*(?=[\s);&|`]|$)|\/+(?=[\s);&|`]|$)|~(?=[\s);&|`]|$)|~\/|\.(?=[\s);&|`]|$))|git\s+(?:push\b|reset\s+--hard\b|clean\s+-[a-z]*f|checkout\s+--\s+\.(?=[\s);&|`]|$))|mkfs\b|dd\s+if=)/i;
const arr = v => (Array.isArray(v) ? v : []);

export function validateCheckCmd(cmd, prefixes = []) {
  const s = String(cmd || '').trim();
  if (!s) return 'empty checkCmd';
  if (CONTROL_CHARS.test(s)) return `checkCmd must be a single line: ${s}`;
  if (NOOP_CMD.test(s)) return `checkCmd cannot be a no-op: ${s}`;
  if (DANGEROUS_CMD.test(s)) return `checkCmd contains disallowed command: ${s}`;
  if (Array.isArray(prefixes) && prefixes.length > 0 && !prefixes.some(p => s.startsWith(p))) {
    return `checkCmd does not match configured checkPrefixes: ${s}`;
  }
  return '';
}

export function plan(ctx) {
  const { inputs, outputs, state } = ctx;
  const preset = arr(outputs.preflight && outputs.preflight.presetUnits);
  const raw = preset.length ? preset : arr(outputs.split && outputs.split.units);
  const prefixes = arr(inputs.checkPrefixes).map(p => String(p || '')).filter(Boolean);
  const max = Math.min(6, Math.max(1, Number(inputs.maxUnits) || 5));
  const seen = new Set();
  const units = [];
  const rejected = [];
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue;
    let id = slugify(u.id || u.title, 32);
    while (seen.has(id)) id = `${id}-x`;
    const cmd = String(u.checkCmd || '').trim();
    const rawCheckFiles = arr(u.checkFiles);
    const validCheckFiles = rawCheckFiles.filter(safePath);
    const mode = u.mode === 'verify' ? 'verify' : u.mode === 'tdd' ? 'tdd' : validCheckFiles.length ? 'tdd' : 'verify';
    const checkFiles = mode === 'verify' ? [] : validCheckFiles;
    let why = '';
    if (units.length >= max) why = 'over maxUnits';
    else {
      const cmdErr = validateCheckCmd(cmd, prefixes);
      if (cmdErr) why = cmdErr;
      else if (mode === 'tdd' && !checkFiles.length) why = 'no valid checkFiles for tdd mode';
      else if (!String(u.prompt || '').trim()) why = 'empty prompt';
    }
    if (why) {
      rejected.push({ id, reason: why });
      continue;
    }
    seen.add(id);
    units.push({
      id,
      title: String(u.title || id).slice(0, 80),
      goal: String(u.goal || ''),
      mode,
      checkFiles,
      implFiles: arr(u.implFiles).filter(safePath),
      checkCmd: cmd,
      prompt: String(u.prompt),
      commitMessage: safeMessage(`feat(${id}): ${u.title || id}`),
    });
  }
  if (!units.length) {
    throw new Error(
      `plan: no valid units (${rejected.map(r => `${r.id}: ${r.reason}`).join('; ') || 'splitter returned none'})`,
    );
  }
  const splitFullCheck = String((outputs.split && outputs.split.fullCheckCmd) || '').trim();
  const inputFullCheck = String(inputs.fullCheckCmd || '').trim();
  const preFullCheck = String((outputs.preflight && outputs.preflight.fullCheckCmd) || '').trim();
  const discoveredFullCheck = splitFullCheck && !validateCheckCmd(splitFullCheck, prefixes) ? splitFullCheck : '';
  const fullCheckCmd = inputFullCheck || preFullCheck || discoveredFullCheck;
  state.slug = slugify(inputs.requirement, 32);
  state.fullCheckCmd = fullCheckCmd;
  for (const u of units) tel(ctx, u.id, 'queued', 'info', 0, u.title);
  return {
    units,
    count: units.length,
    rejected,
    source: preset.length ? 'preset' : 'split',
    fullCheckCmd,
  };
}
