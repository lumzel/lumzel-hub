import { composeConstraints, parseLessonsMd, line } from './lib.js';
const OWN = '.lumzel/hanakoxbt-loops-and-graphs/';

export async function preflight(ctx) {
  const { inputs, sh, fsReadOrEmpty } = ctx;
  if (!(await sh('git rev-parse --is-inside-work-tree', { timeoutSec: 15 })).ok) {
    return { isGit: false, clean: false, dirty: [], dirtyCount: 0, reason: 'not a git repository', presetUnits: [] };
  }
  const st = await sh('git status --porcelain=v1', { timeoutSec: 30 });
  const dirty = st.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3))
    .filter(p => !p.startsWith(OWN));
  const fileLessons = parseLessonsMd(fsReadOrEmpty(inputs.lessonsFile || OWN + 'lessons.md'));
  const merged = composeConstraints([...(inputs.constraints || []), ...fileLessons.map(l => l.text)]);
  const det = await detect(ctx);
  const setupCmd = inputs.setupCmd === 'auto' ? '' : (inputs.setupCmd || '');
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
    fullCheckCmd: inputs.fullCheckCmd || det.fullCheckCmd,
    setupCmd,
    repoHints: det.hints,
    presetUnits: Array.isArray(inputs.units) ? inputs.units : [],
  };
}

async function detect(ctx) {
  const has = async f => (await ctx.sh(`test -e ${f}`, { timeoutSec: 5 })).ok;
  const dirs = await line(ctx, 'git ls-tree -d --name-only HEAD | head -20');
  if (await has('package.json')) {
    let pkg = {};
    try {
      pkg = JSON.parse(ctx.fsReadOrEmpty('package.json') || '{}');
    } catch (_) {}
    const pm = (await has('pnpm-lock.yaml'))
      ? 'pnpm'
      : (await has('yarn.lock'))
        ? 'yarn'
        : (await has('bun.lock')) || (await has('bun.lockb'))
          ? 'bun'
          : 'npm';
    const setup = {
      pnpm: 'pnpm install --frozen-lockfile --prefer-offline',
      yarn: 'yarn install --frozen-lockfile',
      bun: 'bun install --frozen-lockfile',
      npm: 'npm ci',
    }[pm];
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    const fw = deps.vitest ? 'vitest' : deps.jest ? 'jest' : deps.mocha ? 'mocha' : 'unknown';
    return {
      setupCmd: setup,
      fullCheckCmd: pkg.scripts && pkg.scripts.test ? `${pm} test` : '',
      hints: `node/${pm}, tests: ${fw}, dirs: ${dirs.replace(/\n/g, ' ')}`,
    };
  }
  if (await has('Cargo.toml')) {
    return {
      setupCmd: '',
      fullCheckCmd: 'cargo test --quiet',
      hints: `rust/cargo, dirs: ${dirs.replace(/\n/g, ' ')}`,
    };
  }
  if (await has('pyproject.toml')) {
    return {
      setupCmd: (await has('uv.lock')) ? 'uv sync' : '',
      fullCheckCmd: 'pytest -q',
      hints: `python, dirs: ${dirs.replace(/\n/g, ' ')}`,
    };
  }
  if (await has('go.mod')) {
    return {
      setupCmd: '',
      fullCheckCmd: 'go test ./...',
      hints: `go, dirs: ${dirs.replace(/\n/g, ' ')}`,
    };
  }
  return { setupCmd: '', fullCheckCmd: '', hints: `dirs: ${dirs.replace(/\n/g, ' ')}` };
}
