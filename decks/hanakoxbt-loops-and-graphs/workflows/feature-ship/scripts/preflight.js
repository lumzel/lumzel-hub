import { composeConstraints, parseLessonsMd, line } from './lib.js';
const OWN = '.lumzel/hanakoxbt-loops-and-graphs/';

export async function preflight(ctx) {
  const { inputs, sh, fsReadOrEmpty } = ctx;
  if (!(await sh('git rev-parse --is-inside-work-tree', { timeoutSec: 15 })).ok) {
    return { isGit: false, clean: false, dirty: [], dirtyCount: 0, reason: 'not a git repository', presetUnits: [] };
  }
  const st = await sh('git -c core.quotePath=false status --porcelain=v1', { timeoutSec: 30 });
  const dirty = st.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).trim())
    .filter(p => p && !p.startsWith(OWN));
  const fileLessons = parseLessonsMd(fsReadOrEmpty(inputs.lessonsFile || OWN + 'lessons.md'));
  const merged = composeConstraints([...(inputs.constraints || []), ...fileLessons.map(l => l.text)]);
  const rootEntries = await listRootEntries(ctx, st.stdout);
  const setupCmd = inputs.setupCmd === 'auto' ? '' : String(inputs.setupCmd || '').trim();
  const fullCheckCmd = String(inputs.fullCheckCmd || '').trim();
  return {
    isGit: true,
    clean: true,
    dirty: dirty.slice(0, 20),
    dirtyCount: dirty.length,
    reason: '',
    branch: await line(ctx, 'git rev-parse --abbrev-ref HEAD'),
    headSha: await line(ctx, 'git rev-parse HEAD'),
    constraintsText: merged.text || '(none)',
    constraintCount: merged.count,
    constraintIds: merged.ids,
    fullCheckCmd,
    setupCmd,
    repoHints: rootEntries.length ? `root entries: ${rootEntries.join(' ')}` : 'empty repo',
    presetUnits: Array.isArray(inputs.units) ? inputs.units : [],
  };
}

async function listRootEntries(ctx, statusStdout) {
  const trackedRaw = await line(ctx, 'git -c core.quotePath=false ls-tree --name-only HEAD | head -40');
  const seen = new Set(trackedRaw.split('\n').map(s => s.trim()).filter(Boolean));
  for (const rawLine of String(statusStdout || '').split('\n')) {
    if (!rawLine || rawLine.length < 4) continue;
    const p = rawLine.slice(3).trim();
    if (!p || p.startsWith(OWN)) continue;
    const top = p.split('/')[0];
    if (top) seen.add(top);
  }
  return Array.from(seen).slice(0, 40);
}
