import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { preflight } from '../workflows/feature-ship/scripts/preflight.js';
import { plan, validateCheckCmd } from '../workflows/feature-ship/scripts/plan.js';
import { laneStart, redCheck, greenCheck, unitReport } from '../workflows/feature-ship/scripts/unit.js';
import { integrate, reverify } from '../workflows/feature-ship/scripts/integrate.js';
import { retro, record } from '../workflows/feature-ship/scripts/learn.js';
import { scope as reviewScope } from '../workflows/code-review/scripts/scope.js';
import { evidence as reviewEvidence, merge as reviewMerge, propose as reviewPropose } from '../workflows/code-review/scripts/findings.js';
import { applyNoticeToMap, createTelemetryController } from '../src/telemetry.js';
import { createLessonsController } from '../src/lessons.js';
import { createDemoPlayer } from '../src/demo/player.js';
import { derive } from '../src/runModel.js';
import { checkTopologyDrift } from '../src/topology/layout.js';
import { ALL_YAML_KNOWN_IDS as SHIP_YAML_KNOWN_IDS } from '../src/topology/feature-ship.js';
import { ALL_YAML_KNOWN_IDS as REVIEW_YAML_KNOWN_IDS } from '../src/topology/code-review.js';

import { safePath } from '../workflows/feature-ship/scripts/lib.js';
import { safePath as reviewSafePath } from '../workflows/code-review/scripts/lib.js';

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
  assert.equal(reviewSafePath('Tests/My App/Sample (Test).swift'), true);
  assert.equal(reviewSafePath('../secret.ts'), false);

  assert.match(validateCheckCmd('true'), /no-op/);
  assert.match(validateCheckCmd('exit'), /no-op/);
  assert.match(validateCheckCmd('echo ok && true'), /no-op/);
  assert.match(validateCheckCmd('rm -rf /'), /disallowed/);
  assert.match(validateCheckCmd('sudo rm -rf /'), /disallowed/);
  assert.match(validateCheckCmd('env rm -rf ~'), /disallowed/);
  assert.match(validateCheckCmd('command rm -rf /*'), /disallowed/);
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

test('feature-ship and code-review workflow.yaml files have zero topology drift', () => {
  const shipYaml = fs.readFileSync(path.join(DECK_ROOT, 'workflows/feature-ship/workflow.yaml'), 'utf8');
  assert.deepEqual(checkTopologyDrift(shipYaml, SHIP_YAML_KNOWN_IDS), []);

  const reviewYaml = fs.readFileSync(path.join(DECK_ROOT, 'workflows/code-review/workflow.yaml'), 'utf8');
  assert.deepEqual(checkTopologyDrift(reviewYaml, REVIEW_YAML_KNOWN_IDS), []);
});

test('createTelemetryController consumes run.logs without sessionId, ignores null seq, and handles prepareRetry', async () => {
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

  // First snapshot: active run without sessionId, emitting start notice and ignoring null/empty seq
  const runV1 = {
    runId: 'run-logs-1',
    workflowId: 'feature-ship',
    sessionId: '',
    state: 'running',
    logs: [
      { seq: null, text: '⟦ag⟧{"v":1,"u":"u-bad","p":"start","s":"info","a":0,"m":"bad"}', timestamp: 99 },
      { seq: '', text: '⟦ag⟧{"v":1,"u":"u-bad2","p":"start","s":"info","a":0,"m":"bad2"}', timestamp: 99 },
      { seq: 1, text: 'plain non-telemetry log', timestamp: 100 },
      { seq: 2, text: '⟦ag⟧{"v":1,"u":"u1","p":"start","s":"info","a":0,"m":"start"}', timestamp: 101 },
    ],
  };
  await controller.syncRun(runV1);
  assert.equal(agentLogsCalls, 0);
  assert.equal(state.telemetry.lastSeq, 2);
  assert.equal(state.telemetry.byUnit['u-bad'], undefined);
  assert.equal(state.telemetry.byUnit['u-bad2'], undefined);
  assert.equal(state.telemetry.byUnit.u1.status, 'running');
  assert.deepEqual(state.telemetry.byUnit.u1.phases, ['running', 'pending', 'pending', 'pending']);

  // Terminal snapshot: carries seq 3 (done) and must not be dropped by !active check
  const runDone = {
    runId: 'run-logs-1',
    workflowId: 'feature-ship',
    sessionId: '',
    state: 'completed',
    logs: [
      ...runV1.logs,
      { seq: 3, text: '⟦ag⟧{"v":1,"u":"u1","p":"done","s":"pass","a":0,"m":"done"}', timestamp: 105 },
    ],
  };
  await controller.syncRun(runDone);
  assert.equal(state.telemetry.lastSeq, 3);
  assert.equal(state.telemetry.byUnit.u1.status, 'pass');
  assert.equal(state.telemetry.byUnit.u1.events.length, 2);
  assert.deepEqual(state.telemetry.byUnit.u1.phases, ['pass', 'pass', 'pass', 'pass']);

  // Downstream retry preserves existing unit telemetry
  controller.prepareRetry(runDone, 'integrate');
  assert.equal(state.telemetry.byUnit.u1.status, 'pass');
  assert.equal(state.telemetry.lastSeq, 3);

  // Upstream retry clears byUnit, skips appended old logs matching watermark, consumes seq 4
  controller.prepareRetry(runDone, 'units');
  assert.deepEqual(state.telemetry.byUnit, {});
  assert.equal(state.telemetry.lastSeq, 0);
  await controller.syncRun({
    ...runDone,
    state: 'running',
    logs: [
      ...runDone.logs,
      { seq: 4, text: '⟦ag⟧{"v":1,"u":"u1","p":"start","s":"info","a":0,"m":"retry-start"}', timestamp: 110 },
    ],
  });
  assert.equal(state.telemetry.lastSeq, 4);
  assert.equal(state.telemetry.byUnit.u1.events.length, 1);
  assert.equal(state.telemetry.byUnit.u1.events[0].m, 'retry-start');

  // Upstream retry when runtime resets/truncates run.logs from seq 1 must still ingest new logs
  controller.prepareRetry(
    {
      ...runDone,
      logs: [{ seq: 4, text: 'old log 4', timestamp: 110 }],
    },
    'split',
  );
  await controller.syncRun({
    runId: 'run-logs-1',
    workflowId: 'feature-ship',
    sessionId: '',
    state: 'running',
    logs: [{ seq: 1, text: '⟦ag⟧{"v":1,"u":"u2","p":"start","s":"info","a":0,"m":"fresh"}', timestamp: 120 }],
  });
  assert.equal(state.telemetry.lastSeq, 1);
  assert.equal(state.telemetry.byUnit.u2.events[0].m, 'fresh');

  controller.reset();
  assert.equal(state.telemetry.lastSeq, 0);
  assert.deepEqual(state.telemetry.byUnit, {});
});

test('learn retro and record format verify-only/skipped digests, quote branches, and dedupe lessons', async () => {
  const deletedCmds = [];
  const ctx = makeCtx({
    inputs: {
      requirement: 'Add settings screen',
      constraints: ['Existing constraint'],
    },
    state: {
      reworks: 1,
      branches: ["feat/a'b", 'main'],
    },
    outputs: {
      preflight: { branch: 'main' },
      ship: { ok: true },
      integrate: { check: { ok: true, skipped: true }, conflicted: [] },
      units: {
        results: [
          {
            item: { id: 'ui-settings', mode: 'verify', checkFiles: [] },
            ok: true,
            retries: 0,
            outputs: { green_gate: { attempt: 2 } },
          },
        ],
      },
      distill: {
        text: JSON.stringify({
          lessons: [
            { text: 'existing constraint', scope: 'general', evidence: 'dup' },
            { text: 'Always run swift build cleanly', scope: 'check', evidence: 'ui-settings' },
            { text: 'Unknown scope clamps to general', scope: 'bogus', evidence: 'row 1' },
          ],
        }),
      },
    },
    sh: async cmd => {
      deletedCmds.push(cmd);
      return { ok: true, code: 0, stdout: '', stderr: '' };
    },
  });

  const retroOut = await retro(ctx);
  assert.match(retroOut.digest, /verify-only green×2/);
  assert.match(retroOut.digest, /full check: skipped/);
  assert.deepEqual(deletedCmds, ["git branch -D 'feat/a'\\''b'"]);
  assert.deepEqual(retroOut.cleanedBranches, ["feat/a'b"]);

  ctx.outputs.retro = retroOut;
  const recOut = record(ctx);
  assert.equal(recOut.lessons.length, 2);
  assert.equal(recOut.lessons[0].scope, 'check');
  assert.equal(recOut.lessons[1].scope, 'general');
});

test('code-review scope and findings scripts handle quoting, fallback base HEAD, lens dedupe, and proposals', async () => {
  const cmds = [];
  const sc = await reviewScope(
    makeCtx({
      inputs: {
        base: '',
        checkCmd: '   ',
        lenses: ['correctness', 'security', 'invalid'],
        constraints: ['Check nil cases'],
      },
      sh: async cmd => {
        cmds.push(cmd);
        if (cmd.includes('origin/HEAD')) return { ok: false, code: 1, stdout: '', stderr: '' };
        if (cmd.includes('--verify main') || cmd.includes('--verify master')) {
          return { ok: false, code: 1, stdout: '', stderr: '' };
        }
        if (cmd.startsWith('git merge-base')) return { ok: true, code: 0, stdout: 'abc123\n', stderr: '' };
        if (cmd.includes('diff --name-only')) return { ok: true, code: 0, stdout: 'src/a b.ts\nsrc/c.ts\n', stderr: '' };
        if (cmd.includes('ls-files --others')) return { ok: true, code: 0, stdout: 'src/new file.ts\n', stderr: '' };
        if (cmd.includes('diff --unified=3')) return { ok: true, code: 0, stdout: 'diff --git a/src/c.ts b/src/c.ts\n', stderr: '' };
        return { ok: true, code: 0, stdout: '', stderr: '' };
      },
    }),
  );

  assert.equal(sc.base, 'HEAD');
  assert.equal(sc.checkCmd, '');
  assert.deepEqual(sc.files, ['src/a b.ts', 'src/c.ts', 'src/new file.ts']);
  assert.ok(cmds.some(c => c.includes("git merge-base HEAD 'HEAD'")));
  assert.ok(cmds.some(c => c.includes("git -c core.quotePath=false diff --name-only 'abc123'")));
  assert.ok(cmds.some(c => c.includes("git -c core.quotePath=false ls-files --others")));

  const fileContents = {
    'src/a b.ts': 'const val = unsafeCall(userInput);',
    'src/c.ts': 'const val2 = unsafeCall(otherInput);',
  };
  const ev1 = reviewEvidence(
    makeCtx({
      item: { id: 'correctness' },
      state: {},
      outputs: {
        scope: sc,
        review: {
          findings: [
            { severity: 'high', file: 'src/a b.ts', line: 1, title: 'Unsafe call', evidence: 'Uses `unsafeCall(userInput)`', category: 'validation' },
            { severity: 'low', file: 'outside.ts', line: 1, title: 'Not in diff', evidence: 'Uses `fooBarBaz()`' },
          ],
        },
      },
      fsReadOrEmpty: p => fileContents[p] || '',
    }),
  );
  assert.equal(ev1.ok, false);
  assert.equal(ev1.dropped, 1);

  const merged = reviewMerge(
    makeCtx({
      outputs: {
        scope: sc,
        checks: {},
        lenses: {
          results: [
            {
              item: { id: 'correctness' },
              ok: true,
              outputs: {
                evidence: {
                  valid: [
                    { severity: 'medium', file: 'src/a b.ts', line: 1, title: 'Unsafe call', evidence: '`unsafeCall(userInput)`', lens: 'correctness', category: 'validation' },
                    { severity: 'low', file: 'src/a b.ts', line: 1, title: 'Unsafe call', evidence: '`unsafeCall(userInput)`', lens: 'correctness', category: 'validation' },
                  ],
                },
              },
            },
            {
              item: { id: 'security' },
              ok: true,
              outputs: {
                evidence: {
                  valid: [
                    { severity: 'high', file: 'src/a b.ts', line: 1, title: 'Unsafe call', evidence: '`unsafeCall(userInput)`', lens: 'security', category: 'validation' },
                    { severity: 'medium', file: 'src/c.ts', line: 1, title: 'Another unsafe call', evidence: '`unsafeCall(otherInput)`', lens: 'security', category: 'validation' },
                  ],
                },
              },
            },
          ],
        },
      },
    }),
  );
  assert.equal(merged.verdict, 'block');
  assert.equal(merged.checks.skipped, true);
  assert.equal(merged.findings.length, 2);
  assert.equal(merged.findings[0].severity, 'high');
  assert.deepEqual(merged.findings[0].lenses, ['correctness', 'security']);
  assert.equal(merged.counts.high, 1);
  assert.equal(merged.counts.medium, 1);

  const prop = reviewPropose(makeCtx({ outputs: { merge: merged } }));
  assert.equal(prop.lessons.length, 1);
  assert.equal(prop.lessons[0].scope, 'review');
});

test('lessons ingestRunResults does not double-count hits and demo stop resets mode & demo lessons', async () => {
  let state = {
    mode: 'live',
    preset: 'feature-ship',
    caps: { db: false, files: false, workflow: true, agent: true },
    goal: '',
    run: null,
    selection: null,
    lessons: {
      rev: 0,
      list: [{ id: 'l_1', text: 'Keep tests deterministic', scope: 'check', status: 'active', hits: 0, evidence: '', createdAt: 1, updatedAt: 1 }],
    },
    parsedFileEntries: [],
    fileLessons: [],
    fileSyncStatus: 'off',
    telemetry: { rev: 0, byUnit: {}, lastSeq: 0 },
    prefs: { demoSpeed: 1 },
    ui: { demoFrame: 0, demoSpeed: 1, tick: 0, inspectorOpen: false, tab: 'node' },
  };
  const store = {
    get: () => state,
    set: fn => {
      state = typeof fn === 'function' ? fn(state) : fn;
    },
  };
  const lessonsCtrl = createLessonsController(store, async fn => ({ ok: true, v: await fn() }));
  const completedRun = {
    runId: 'run-hit-1',
    workflowId: 'feature-ship',
    state: 'completed',
    outputs: { preflight: { constraintIds: ['l_1'] }, record: { lessons: [] } },
  };
  await lessonsCtrl.ingestRunResults(completedRun);
  await lessonsCtrl.ingestRunResults(completedRun);
  assert.equal(state.lessons.list[0].hits, 1);

  // Demo seek + stop clears demo-injected lessons and sets mode to idle
  state.lessons.list = [];
  const demo = createDemoPlayer(store);
  demo.seek('gate');
  assert.equal(state.mode, 'demo');
  assert.ok(state.lessons.list.length > 0);
  demo.stop();
  assert.equal(state.mode, 'idle');
  assert.equal(state.run, null);
  assert.equal(state.lessons.list.length, 0);
});


