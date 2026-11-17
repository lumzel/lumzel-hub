import { normText, lessonId, safeReadText } from './lib.js';
const RANK = { high: 3, medium: 2, low: 1 };
const quoteOf = s => {
  const m = /`([^`]{6,})`/.exec(String(s || ''));
  return m ? m[1] : '';
};
const squash = s => String(s || '').replace(/\s+/g, ' ').trim();

export function evidence(ctx) {
  const { outputs, item, state } = ctx;
  const a = (state.evAttempts || 0) + 1;
  state.evAttempts = a;
  const changed = new Set(outputs.scope.files);
  const list = (outputs.review && outputs.review.findings) || [];
  const valid = [];
  const invalid = [];
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    if (!f.file) {
      invalid.push('finding is missing file');
      continue;
    }
    if (!changed.has(f.file)) {
      invalid.push(`${f.file}: file is not part of the diff`);
      continue;
    }
    const q = quoteOf(f.evidence);
    if (!q) {
      invalid.push(`${f.file}:${f.line || '?'} "${f.title}": evidence has no \`code quote\``);
      continue;
    }
    if (!squash(safeReadText(ctx, f.file)).includes(squash(q))) {
      invalid.push(`${f.file}: quote not found in file: ${q.slice(0, 80)}`);
      continue;
    }
    valid.push(Object.assign({ lens: item.id }, f));
  }
  // Accept valid-only results starting on the 2nd attempt so one bad quote does not fail the whole lens.
  const ok = invalid.length === 0 || a >= 2;
  return { ok, valid, dropped: invalid.length, feedback: invalid.join('\n'), attempt: a };
}

export function merge(ctx) {
  const { outputs } = ctx;
  const results = (outputs.lenses && outputs.lenses.results) || [];
  const lensStatus = results.map(r => ({
    id: (r.item && r.item.id) || '',
    ok: r.ok,
    retries: r.retries || 0,
    error: r.error || '',
    dropped: (r.outputs && r.outputs.evidence && r.outputs.evidence.dropped) || 0,
  }));
  const byKey = new Map();
  for (const r of results) {
    if (!r.ok) continue;
    for (const f of (r.outputs && r.outputs.evidence && r.outputs.evidence.valid) || []) {
      const key = `${f.file}:${Math.round((f.line || 0) / 4)}:${normText(f.title).slice(0, 32)}`;
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, Object.assign({}, f, { lenses: f.lens ? [f.lens] : [] }));
      else {
        if (f.lens && !prev.lenses.includes(f.lens)) prev.lenses.push(f.lens);
        if ((RANK[f.severity] || 0) > (RANK[prev.severity] || 0)) prev.severity = f.severity;
      }
    }
  }
  const findings = Array.from(byKey.values()).sort(
    (a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0) || String(a.file).localeCompare(String(b.file)),
  );
  const ck = outputs.checks || {};
  const skipped = !(outputs.scope && outputs.scope.checkCmd);
  const checks = {
    skipped,
    ok: skipped ? null : !!ck.ok,
    code: ck.code,
    tail: String((ck.stdout || '') + '\n' + (ck.stderr || '')).slice(-4000),
  };
  const counts = { high: 0, medium: 0, low: 0 };
  findings.forEach(f => {
    if (Object.prototype.hasOwnProperty.call(counts, f.severity)) counts[f.severity]++;
  });
  const verdict =
    counts.high > 0 || checks.ok === false
      ? 'block'
      : counts.medium > 0 || lensStatus.some(l => !l.ok)
        ? 'attention'
        : 'clean';
  return { verdict, counts, findings, lensStatus, checks, files: outputs.scope.files.length };
}

export function propose(ctx) {
  const m = ctx.outputs.merge;
  const byCat = {};
  for (const f of m.findings) {
    const c = f.category || f.lens;
    (byCat[c] = byCat[c] || []).push(f);
  }
  const lessons = Object.entries(byCat)
    .filter(([, fs]) => new Set(fs.map(f => f.file)).size >= 2)
    .slice(0, 3)
    .map(([cat, fs]) => {
      const text = `Recurring ${cat} issue across ${new Set(fs.map(f => f.file)).size} files: ${fs[0].title}. Check for it before review.`.slice(
        0,
        280,
      );
      return {
        id: lessonId(text),
        text,
        scope: 'review',
        evidence: fs
          .slice(0, 3)
          .map(f => `${f.file}:${f.line || ''}`)
          .join(', '),
      };
    });
  return { lessons, verdict: m.verdict };
}
