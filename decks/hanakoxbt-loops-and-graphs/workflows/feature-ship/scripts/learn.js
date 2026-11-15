import { firstJson, normText, lessonId } from './lib.js';
const SCOPES = ['split', 'check', 'impl', 'review', 'general'];

export async function retro(ctx) {
  const { outputs, state, sh } = ctx;
  const results = (outputs.units && outputs.units.results) || [];
  const shipped = !!(outputs.ship && outputs.ship.ok);
  const rows = results.map(r => {
    const o = r.outputs || {};
    const g = o.green_gate || {};
    const red = o.red_gate || {};
    return (
      `- ${r.item && r.item.id}: ${r.ok ? 'PASS' : 'FAIL'} · red×${red.attempt || 0} green×${g.attempt || 0}` +
      (g.signature ? ` · sig: ${g.signature}` : '') +
      (red.ok === false ? ` · red: ${red.reason}` : '') +
      (g.ok === false ? ` · green: ${g.reason}` : '') +
      (r.error ? ` · error: ${String(r.error).slice(0, 160)}` : '')
    );
  });
  const integ = outputs.integrate || {};
  const note = outputs.human_gate && outputs.human_gate.payload && outputs.human_gate.payload.note;
  const digest = [
    `requirement: ${ctx.inputs.requirement}`,
    `shipped: ${shipped}`,
    'units:',
    ...rows,
    integ.check && !integ.check.ok
      ? `full check failed: ${integ.check.reason}\n${String(integ.check.tail || '').slice(-1500)}`
      : '',
    (integ.conflicted || []).length ? `merge conflicts: ${integ.conflicted.map(c => c.id).join(', ')}` : '',
    note ? `reviewer requested changes (${state.reworks || 0} rework rounds): ${note}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
  const cleaned = [];
  if (shipped) {
    for (const b of state.branches || []) {
      if ((await sh(`git branch -D ${b}`, { timeoutSec: 30 })).ok) cleaned.push(b);
    }
  }
  return {
    shipped,
    digest,
    cleanedBranches: cleaned,
    keptBranches: shipped ? [] : state.branches || [],
    stats: {
      units: results.length,
      passed: results.filter(r => r.ok).length,
      retries: results.reduce((n, r) => n + (r.retries || 0), 0),
      reworks: state.reworks || 0,
    },
  };
}

export function record(ctx) {
  const { outputs, inputs } = ctx;
  const parsed = firstJson(outputs.distill && outputs.distill.text) || {};
  const active = new Set((inputs.constraints || []).map(normText));
  const lessons = (Array.isArray(parsed.lessons) ? parsed.lessons : [])
    .slice(0, 3)
    .map(l => ({
      text: String((l && l.text) || '').trim().slice(0, 280),
      scope: SCOPES.includes(l && l.scope) ? l.scope : 'general',
      evidence: String((l && l.evidence) || '').slice(0, 400),
    }))
    .filter(l => l.text && !active.has(normText(l.text)))
    .map(l => Object.assign({ id: lessonId(l.text) }, l));
  return { lessons, shipped: outputs.retro.shipped, stats: outputs.retro.stats };
}
