// QuickJS sandbox helpers. ctx = { inputs, outputs, state, item, round, sh, fsReadOrEmpty, log, sleep }.
export const TEL = '⟦ag⟧';
export function tel(ctx, u, p, s, a, m) {
  ctx.log(TEL + JSON.stringify({ v: 1, u, p, s, a: a || 0, m: m ? String(m).slice(0, 160) : '' }));
}
export function stripAnsi(s) {
  return String(s || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}
export function tail(text, maxLines = 60, maxChars = 4000) {
  const t = stripAnsi(text).split('\n').slice(-maxLines).join('\n');
  return t.length > maxChars ? t.slice(-maxChars) : t;
}
export function normText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}
export function lessonId(text) {
  return 'l_' + fnv1a(normText(text));
}
// lessons.md line: "- [scope] text  <!-- id:l_xxxxxxxx -->"
export function parseLessonsMd(md) {
  const out = [];
  for (const line of String(md || '').split('\n')) {
    const m = /^\s*-\s+(?:\[([a-z]+)\]\s+)?(.+?)\s*(?:<!--.*-->)?\s*$/.exec(line);
    if (m && m[2]) out.push({ scope: m[1] || 'general', text: m[2].trim() });
  }
  return out;
}
export function composeConstraints(list) {
  const seen = new Set();
  const items = [];
  for (const raw of list || []) {
    const text = String(raw || '').trim();
    const k = normText(text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    items.push(text);
  }
  return {
    count: items.length,
    text: items.map((t, i) => `C${i + 1}. ${t}`).join('\n'),
    ids: items.map(lessonId),
  };
}
export function slugify(s, max = 40) {
  const v = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  return v || 'unit';
}
export function safeMessage(s, max = 72) {
  return String(s || '')
    .replace(/[^A-Za-z0-9 ():._\/\-\u4e00-\u9fff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
export function shQuote(s) {
  return `'${String(s || '').replace(/'/g, "'\\''")}'`;
}
export function safePath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.trim() !== p) return false;
  if (p.startsWith('/') || /[\0\r\n\\]/.test(p)) return false;
  const segs = p.split('/');
  return !segs.some(seg => !seg || seg === '.' || seg === '..');
}
export function parseNumstat(stdout) {
  const files = [];
  let ins = 0;
  let del = 0;
  for (const line of String(stdout || '').split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    const a = m[1] === '-' ? 0 : +m[1];
    const d = m[2] === '-' ? 0 : +m[2];
    ins += a;
    del += d;
    files.push({ path: m[3], add: a, del: d });
  }
  return { files, insertions: ins, deletions: del };
}
export function firstJson(text) {
  const s = String(text || '');
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/.exec(s);
  for (const cand of [
    s.trim(),
    fence && fence[1].trim(),
    s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1),
  ]) {
    if (!cand) continue;
    try {
      return JSON.parse(cand);
    } catch (_) {}
  }
  return null;
}
export async function line(ctx, cmd, timeoutSec = 30) {
  return (await ctx.sh(cmd, { timeoutSec })).stdout.trim();
}
