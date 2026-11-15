import { slugify, safeMessage, safePath, tel } from './lib.js';
const META = /[;&|`$<>\\\n]/;
const arr = v => (Array.isArray(v) ? v : []);

export function plan(ctx) {
  const { inputs, outputs, state } = ctx;
  const preset = arr(outputs.preflight.presetUnits);
  const raw = preset.length ? preset : arr(outputs.split && outputs.split.units);
  const prefixes = arr(inputs.checkPrefixes);
  const max = Math.min(6, Math.max(1, Number(inputs.maxUnits) || 5));
  const seen = new Set();
  const units = [];
  const rejected = [];
  for (const u of raw) {
    if (!u || typeof u !== 'object') continue;
    let id = slugify(u.id || u.title, 32);
    while (seen.has(id)) id = `${id}-x`;
    const cmd = String(u.checkCmd || '').trim();
    const checkFiles = arr(u.checkFiles).filter(safePath);
    let why = '';
    if (units.length >= max) why = 'over maxUnits';
    else if (!cmd || META.test(cmd) || !prefixes.some(p => cmd.startsWith(p))) {
      why = `checkCmd not allowed: ${cmd}`;
    } else if (!checkFiles.length) why = 'no valid checkFiles';
    else if (!String(u.prompt || '').trim()) why = 'empty prompt';
    if (why) {
      rejected.push({ id, reason: why });
      continue;
    }
    seen.add(id);
    units.push({
      id,
      title: String(u.title || id).slice(0, 80),
      goal: String(u.goal || ''),
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
  state.slug = slugify(inputs.requirement, 32);
  for (const u of units) tel(ctx, u.id, 'queued', 'info', 0, u.title);
  return { units, count: units.length, rejected, source: preset.length ? 'preset' : 'split' };
}
