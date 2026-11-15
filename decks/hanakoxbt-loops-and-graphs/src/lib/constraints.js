// Exact mirror of workflows/feature-ship/scripts/lib.js and workflows/code-review/scripts/lib.js
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

export function formatLessonsMd(lessons) {
  const header =
    '<!-- hanakoxbt-loops-and-graphs:lessons v1 · managed by the Loops and Graphs (@hanakoxbt) Deck · edits here are read by preflight on the next run -->';
  const lines = (lessons || [])
    .filter(l => l && l.status === 'active' && l.text)
    .map(l => `- [${l.scope || 'general'}] ${l.text.trim()}  <!-- id:${l.id || lessonId(l.text)} -->`);
  return [header, ...lines].join('\n') + '\n';
}
