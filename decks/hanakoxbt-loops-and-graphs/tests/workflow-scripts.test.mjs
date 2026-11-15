import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { preflight } from '../workflows/feature-ship/scripts/preflight.js';
import { plan, validateCheckCmd } from '../workflows/feature-ship/scripts/plan.js';
import { laneStart, redCheck, greenCheck, unitReport } from '../workflows/feature-ship/scripts/unit.js';
import { integrate, reverify } from '../workflows/feature-ship/scripts/integrate.js';
import { applyNoticeToMap, createTelemetryController } from '../src/telemetry.js';
import { derive } from '../src/runModel.js';
import { checkTopologyDrift } from '../src/topology/layout.js';
import { ALL_YAML_KNOWN_IDS } from '../src/topology/feature-ship.js';

import { safePath } from '../workflows/feature-ship/scripts/lib.js';

const DECK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeCtx(overrides = {}) {
  const logs = [];
  return {
    inputs: {},
    outputs: {},
    state: {},
    item: {},
    logs,
    log: msg => logs.push(msg),
    fsReadOrEmpty: () => '',
    sh: async () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
    ...overrides,
  };
}

test('preflight collects generic workspace facts without hardcoding project types', async () => {
  const ctx = makeCtx({
    inputs: {
      constraints: ['Use Swift 6 strict concurrency'],
      setupCmd: 'auto',
      fullCheckCmd: '',
    },
    sh: async cmd => {
      if (cmd.startsWith('git rev-parse --is-inside-work-tree')) return { ok: true, code: 0, stdout: 'true\n', stderr: '' };
      if (cmd.includes('status --porcelain')) return { ok: true, code: 0, stdout: '?? NewFile.swift\n?? My App/View.swift\n', stderr: '' };
      if (cmd.includes('ls-tree --name-only HEAD')) {
        return { ok: true, code: 0, stdout: 'OffClock.xcodeproj\nSources\nTests\n', stderr: '' };
      }
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return { ok: true, code: 0, stdout: 'main\n', stderr: '' };
      if (cmd === 'git rev-parse HEAD') return { ok: true, code: 0, stdout: 'abc1234\n', stderr: '' };
      return { ok: true, code: 0, stdout: '', stderr: '' };
    },
  });

  const res = await preflight(ctx);
  assert.equal(res.isGit, true);
  assert.equal(res.branch, 'main');
  assert.equal(res.fullCheckCmd, '');
  assert.equal(res.setupCmd, '');
  assert.match(res.repoHints, /OffClock\.xcodeproj/);
  assert.match(res.repoHints, /NewFile\.swift/);
  assert.match(res.repoHints, /My App/);
});

test('plan accepts arbitrary toolchains when checkPrefixes is empty, including xcodebuild & chained commands', () => {
  const ctx = makeCtx({
    inputs: { requirement: 'macOS 27 UI refactor', checkPrefixes: [], maxUnits: 5 },
    outputs: {
      preflight: { presetUnits: [], fullCheckCmd: '' },
      split: {
        fullCheckCmd: 'xcodebuild test -project OffClock.xcodeproj -scheme OffClock -destination platform=macOS',
        units: [
          {
            id: 'menubar-popover-ui',
            title: 'Menu Bar Popover',
            mode: 'tdd',
            checkFiles: ['Tests/OffClockCoreTests/MenuBarPresentationTests.swift'],
            implFiles: ['Sources/OffClockApp/Views/MenuBarPopoverView.swift'],
            checkCmd:
              'xcodebuild test -project OffClock.xcodeproj -scheme OffClock -sdk macosx27.2 -destination platform=macOS -only-testing:OffClockCoreTests/MenuBarPresentationTests',
            prompt: 'Refactor menu bar popover',
          },
          {
            id: 'settings-native-ui',
            title: 'Settings Native UI',
            mode: 'verify',
            checkFiles: ['Tests/ShouldBeCleared.swift'],
            implFiles: ['Sources/OffClockApp/Views/SettingsView.swift'],
            checkCmd: 'xcodebuild build -project OffClock.xcodeproj -scheme OffClock -destination platform=macOS | xcbeautify',
            prompt: 'Update settings view layout',
          },
          {
            id: 'nested-route',
            title: 'Nested Next.js Route',
            checkFiles: ['app/(auth)/[id]/page.test.tsx'],
            implFiles: ['app/(auth)/[id]/page.tsx'],
            checkCmd: 'ENV=test pnpm vitest run "app/(auth)/[id]/page.test.tsx"',
            prompt: 'Test route with parens and brackets',
          },
        ],
      },
    },
  });

  const out = plan(ctx);
  assert.equal(out.count, 3);
  assert.equal(out.rejected.length, 0);
  assert.equal(out.units[0].mode, 'tdd');
  assert.equal(out.units[1].mode, 'verify');
  assert.deepEqual(out.units[1].checkFiles, []);
  assert.equal(out.units[2].checkFiles[0], 'app/(auth)/[id]/page.test.tsx');
  assert.equal(
    out.fullCheckCmd,
    'xcodebuild test -project OffClock.xcodeproj -scheme OffClock -destination platform=macOS',
  );
  assert.equal(ctx.state.fullCheckCmd, out.fullCheckCmd);
});

test('plan rejects explicit tdd unit with invalid checkFiles and rejects unsafe split.fullCheckCmd', () => {
  const ctx = makeCtx({
    inputs: { requirement: 'test validation', checkPrefixes: [], maxUnits: 5 },
    outputs: {
      preflight: { presetUnits: [], fullCheckCmd: '' },
      split: {
        fullCheckCmd: 'true',
        units: [
          {
            id: 'bad-tdd',
            title: 'Bad TDD',
            mode: 'tdd',
            checkFiles: ['/abs/bad.test.ts', '.'],
            implFiles: [],
            checkCmd: 'vitest run',
            prompt: 'Should be rejected instead of silently downgraded',
          },
          {
            id: 'good-verify',
            title: 'Good Verify',
            mode: 'verify',
            checkFiles: [],
            implFiles: ['src/App.swift'],
            checkCmd: 'swift build',
            prompt: 'Valid verify unit',
          },
        ],
      },
    },
  });

  const out = plan(ctx);
  assert.equal(out.count, 1);
  assert.equal(out.units[0].id, 'good-verify');
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].reason, /no valid checkFiles for tdd mode/);
  assert.equal(out.fullCheckCmd, '');
});

test('safePath and validateCheckCmd block traversal, dot paths, no-ops, and dangerous commands without false positives', () => {
  assert.equal(safePath('.'), false);
  assert.equal(safePath('./'), false);
  assert.equal(safePath('./foo.ts'), false);
  assert.equal(safePath('   '), false);
  assert.equal(safePath(' foo.ts'), false);
  assert.equal(safePath('foo\\bar.ts'), false);
  assert.equal(safePath('../secret.ts'), false);
  assert.equal(safePath('/etc/passwd'), false);
  assert.equal(safePath('Tests/My App/Sample (Test).swift'), true);
  assert.equal(safePath('app/(auth)/[id]/page.test.tsx'), true);

  assert.match(validateCheckCmd('true'), /no-op/);
  assert.match(validateCheckCmd('exit'), /no-op/);
  assert.match(validateCheckCmd('echo ok && true'), /no-op/);
  assert.match(validateCheckCmd('rm -rf /'), /disallowed/);
  assert.match(validateCheckCmd('rm -rf /*'), /disallowed/);
  assert.match(validateCheckCmd('rm -fr ~'), /disallowed/);
  assert.match(validateCheckCmd('$(rm -rf /)'), /disallowed/);
  assert.match(validateCheckCmd('`rm -rf /`'), /disallowed/);
  assert.match(validateCheckCmd('git clean -fd'), /disallowed/);
  assert.match(validateCheckCmd('git checkout -- .'), /disallowed/);
  assert.match(validateCheckCmd('line1\nline2'), /single line/);
  assert.match(validateCheckCmd('cargo test', ['pnpm ']), /checkPrefixes/);
  assert.equal(validateCheckCmd('rm -rf .build && swift test', []), '');
  assert.equal(validateCheckCmd('./gradlew test --tests FooTest', []), '');
});

test('unit redCheck -> greenCheck -> unitReport handles ENV_FAIL, quoted paths, and tampered checkFiles', async () => {
  const files = {
    'Tests/My App/Sample (Test).swift': 'assert(false)',
  };
  const shCmds = [];
  const item = {
    id: 'ui-unit',
    title: 'UI Unit',
    mode: 'tdd',
    checkFiles: ['Tests/My App/Sample (Test).swift'],
    implFiles: ['Sources/My App/View.swift'],
    checkCmd: 'swift test',
  };
  const state = {};

  const startRes = laneStart(makeCtx({ item, state }));
  assert.equal(startRes.mode, 'tdd');

  const envFailOut = await redCheck(
    makeCtx({
      item,
      state: {},
      outputs: { verify_red: { ok: false, code: 127, stdout: '', stderr: 'xcodebuild: command not found' } },
      sh: async () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
    }),
  );
  assert.equal(envFailOut.ok, false);
  assert.match(envFailOut.reason, /environment reason/);

  const redCtx = makeCtx({
    item,
    state,
    outputs: { verify_red: { ok: false, code: 1, stdout: 'ENOENT or Test failed: expected true', stderr: '' } },
    fsReadOrEmpty: p => files[p] || '',
    sh: async cmd => {
      shCmds.push(cmd);
      return { ok: true, code: 0, stdout: '', stderr: '' };
    },
  });
  const redOut = await redCheck(redCtx);
  assert.equal(redOut.ok, true);
  assert.equal(shCmds[0], "test -e 'Tests/My App/Sample (Test).swift'");

  // Tampering with checkFiles should fail greenCheck
  files['Tests/My App/Sample (Test).swift'] = 'assert(true)';
  const greenFail = await greenCheck(
    makeCtx({
      item,
      state,
      outputs: { verify_green: { ok: true, code: 0, stdout: 'PASS', stderr: '' } },
      fsReadOrEmpty: p => files[p] || '',
    }),
  );
  assert.equal(greenFail.ok, false);
  assert.match(greenFail.reason, /modified check files/);

  // Restoring checkFiles passes greenCheck
  files['Tests/My App/Sample (Test).swift'] = 'assert(false)';
  const greenPass = await greenCheck(
    makeCtx({
      item,
      state,
      outputs: { verify_green: { ok: true, code: 0, stdout: 'PASS', stderr: '' } },
      fsReadOrEmpty: p => files[p] || '',
    }),
  );
  assert.equal(greenPass.ok, true);

  const rep = await unitReport(
    makeCtx({
      item,
      state,
      sh: async cmd => {
        if (cmd === 'git rev-parse HEAD') return { ok: true, code: 0, stdout: 'deadbeef123\n', stderr: '' };
        return { ok: true, code: 0, stdout: '4\t1\tSources/My App/View.swift\n', stderr: '' };
      },
    }),
  );
  assert.equal(rep.insertions, 4);
  assert.equal(rep.deletions, 1);
});

test('verify-only unit preserves skip phases through red_skip -> green -> done and maps failure phases accurately', async () => {
  const item = { id: 'settings-ui', title: 'Settings UI', mode: 'verify', checkFiles: [] };
  const startCtx = makeCtx({ item });
  const res = laneStart(startCtx);
  assert.equal(res.mode, 'verify');

  const greenCtx = makeCtx({
    item,
    state: {},
    outputs: { verify_green: { ok: true, code: 0, stdout: 'BUILD SUCCEEDED', stderr: '' } },
  });
  await greenCheck(greenCtx);

  const reportCtx = makeCtx({
    item,
    state: greenCtx.state,
    sh: async cmd => {
      if (cmd === 'git rev-parse HEAD') return { ok: true, code: 0, stdout: 'abc1234\n', stderr: '' };
      return { ok: true, code: 0, stdout: '', stderr: '' };
    },
  });
  const rep = await unitReport(reportCtx);
  assert.equal(rep.redAttempts, 0);

  const byUnit = {};
  for (const raw of [...startCtx.logs, ...greenCtx.logs, ...reportCtx.logs]) {
    const msg = JSON.parse(raw.slice(raw.indexOf('{')));
    applyNoticeToMap(byUnit, msg, 'feature-ship');
  }
  assert.deepEqual(byUnit['settings-ui'].phases, ['skip', 'skip', 'pass', 'pass']);

  const view = derive(
    {
      runId: 'r1',
      workflowId: 'feature-ship',
      state: 'completed',
      outputs: {
        plan: {
          units: [
            item,
            { id: 'impl-fail', title: 'Impl Fail', mode: 'verify', checkFiles: [] },
            { id: 'green-fail', title: 'Green Fail', mode: 'verify', checkFiles: [] },
          ],
        },
        units: {
          results: [
            { item, ok: true, outputs: {} },
            { item: { id: 'impl-fail', mode: 'verify', checkFiles: [] }, ok: false, outputs: {} },
            {
              item: { id: 'green-fail', mode: 'verify', checkFiles: [] },
              ok: false,
              outputs: { verify_green: { ok: false, code: 1 } },
            },
          ],
        },
      },
    },
    'feature-ship',
    0,
    {},
    1000,
  );
  assert.deepEqual(view.lanes[0].phases, ['skip', 'skip', 'pass', 'pass']);
  assert.deepEqual(view.lanes[1].phases, ['skip', 'skip', 'fail', 'skip']);
  assert.deepEqual(view.lanes[2].phases, ['skip', 'skip', 'pass', 'fail']);
});

test('integrate skips fullCheckCmd gracefully, handles 0 passed units, and classifies verify-mode failures as green', async () => {
  const ctx = makeCtx({
    state: { slug: 'ui-refactor', fullCheckCmd: '' },
    outputs: {
      preflight: { fullCheckCmd: '' },
      plan: { fullCheckCmd: '' },
      units: {
        results: [
          { item: { id: 'u1' }, ok: true, outputs: {} },
          { item: { id: 'u2' }, ok: false, outputs: { green_gate: { ok: false, attempt: 3 } } },
        ],
      },
    },
    fsReadOrEmpty: p => (p === 'Sources/My App/New View.swift' ? 'line1\nline2\n' : ''),
    sh: async cmd => {
      if (cmd === 'git rev-parse --abbrev-ref HEAD') return { ok: true, code: 0, stdout: 'main\n', stderr: '' };
      if (cmd === 'git rev-parse HEAD') return { ok: true, code: 0, stdout: 'abc123\n', stderr: '' };
      if (cmd.includes('diff --numstat')) return { ok: true, code: 0, stdout: '10\t2\tSources/App.swift\n', stderr: '' };
      if (cmd.includes('status --porcelain')) return { ok: true, code: 0, stdout: '?? Sources/My App/New View.swift\n', stderr: '' };
      return { ok: true, code: 0, stdout: '', stderr: '' };
    },
  });

  const out = await integrate(ctx);
  assert.equal(out.shippable, true);
  assert.equal(out.check.skipped, true);
  assert.equal(out.failed[0].phase, 'green');
  assert.equal(ctx.state.candidate.checkSkipped, true);
  assert.equal(ctx.state.candidate.insertions, 13);
  assert.equal(ctx.state.candidate.risk.level, 'medium');

  const rev = await reverify(ctx);
  assert.equal(rev.ok, true);
  assert.equal(rev.round, 1);

  const zeroCtx = makeCtx({
    state: { slug: 'none-passed' },
    outputs: {
      preflight: {},
      units: { results: [{ item: { id: 'u1' }, ok: false, outputs: { red_gate: { ok: false } } }] },
    },
    sh: async () => ({ ok: true, code: 0, stdout: '', stderr: '' }),
  });
  const zeroOut = await integrate(zeroCtx);
  assert.equal(zeroOut.shippable, false);
  assert.equal(zeroOut.failed[0].phase, 'red');
});

test('feature-ship workflow.yaml has zero topology drift against feature-ship.js', () => {
  const yamlText = fs.readFileSync(path.join(DECK_ROOT, 'workflows/feature-ship/workflow.yaml'), 'utf8');
  const unknown = checkTopologyDrift(yamlText, ALL_YAML_KNOWN_IDS);
  assert.deepEqual(unknown, []);
});

test('createTelemetryController consumes run.logs without sessionId and processes terminal completion logs', async () => {
  let state = {
    mode: 'live',
    preset: 'feature-ship',
    caps: { agent: true },
    run: null,
    telemetry: { rev: 0, byUnit: {}, lastSeq: 0 },
  };
  const store = {
    get: () => state,
    set: fn => {
      state = typeof fn === 'function' ? fn(state) : fn;
    },
  };
  let agentLogsCalls = 0;
  const controller = createTelemetryController(store, async fn => {
    agentLogsCalls += 1;
    return { ok: true, v: await fn() };
  });

  // First snapshot: active run without sessionId, emitting start notice in run.logs
  await controller.syncRun({
    runId: 'run-logs-1',
    workflowId: 'feature-ship',
    sessionId: '',
    state: 'running',
    logs: [
      { seq: 1, text: 'plain non-telemetry log', timestamp: 100 },
      { seq: 2, text: '⟦ag⟧{"v":1,"u":"u1","p":"start","s":"info","a":0,"m":"start"}', timestamp: 101 },
    ],
  });
  assert.equal(agentLogsCalls, 0);
  assert.equal(state.telemetry.lastSeq, 2);
  assert.equal(state.telemetry.byUnit.u1.status, 'running');
  assert.deepEqual(state.telemetry.byUnit.u1.phases, ['running', 'pending', 'pending', 'pending']);

  // Terminal snapshot: carries seq 3 (done) and must not be dropped by !active check
  await controller.syncRun({
    runId: 'run-logs-1',
    workflowId: 'feature-ship',
    sessionId: '',
    state: 'completed',
    logs: [
      { seq: 1, text: 'plain non-telemetry log', timestamp: 100 },
      { seq: 2, text: '⟦ag⟧{"v":1,"u":"u1","p":"start","s":"info","a":0,"m":"start"}', timestamp: 101 },
      { seq: 3, text: '⟦ag⟧{"v":1,"u":"u1","p":"done","s":"pass","a":0,"m":"done"}', timestamp: 105 },
    ],
  });
  assert.equal(state.telemetry.lastSeq, 3);
  assert.equal(state.telemetry.byUnit.u1.status, 'pass');
  assert.equal(state.telemetry.byUnit.u1.events.length, 2);
  assert.deepEqual(state.telemetry.byUnit.u1.phases, ['pass', 'pass', 'pass', 'pass']);

  controller.reset();
  assert.equal(state.telemetry.lastSeq, 0);
  assert.deepEqual(state.telemetry.byUnit, {});
});

