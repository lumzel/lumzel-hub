import { applyNoticeToMap } from '../telemetry.js';
import {
  getDemoGoal,
  getDemoConstraints,
  getFeatureShipTimeline,
  getCodeReviewTimeline,
  buildFeatureShipOutputs,
  buildCodeReviewOutputs,
} from './script.js';

const BASE_EPOCH = 1763200000;

export function createDemoPlayer(store) {
  let rafId = null;
  let lastFrameTs = null;
  let active = false;
  let postGateMode = null; // null | 'approve' | 'reject'
  let postGateTimerMs = 0;
  let reworkCount = 0;

  function synthesizeSnapshot(preset, tMs) {
    const timeline = preset === 'code-review' ? getCodeReviewTimeline() : getFeatureShipTimeline();
    const nodeRecords = new Map();
    const byUnit = {};
    let state = 'running';
    let pausedGate = null;

    for (const [kfMs, op, args] of timeline) {
      if (kfMs > tMs) break;
      const evSec = BASE_EPOCH + Math.floor(kfMs / 1000);
      if (op === 'nodeStart') {
        nodeRecords.set(args.id, {
          nodeId: args.id,
          iteration: args.iter || 1,
          round: args.round || 1,
          state: 'running',
          inputJson: args.id === 'split' ? JSON.stringify({ requirement: getDemoGoal(preset) }) : null,
          outputJson: null,
          error: null,
          worktreePath: null,
          sessionId: args.id === 'split' ? 'demo-sess-split' : args.id === 'distill' ? 'demo-sess-distill' : null,
          startedAt: evSec,
          finishedAt: null,
        });
      } else if (op === 'nodeOk') {
        const rec = nodeRecords.get(args.id);
        if (rec) {
          rec.state = 'completed';
          rec.finishedAt = evSec;
        }
      } else if (op === 'notice') {
        applyNoticeToMap(byUnit, { ...args, t: evSec }, preset);
      } else if (op === 'gateWait') {
        nodeRecords.set(args.id, {
          nodeId: args.id,
          iteration: 1 + reworkCount,
          round: 1 + reworkCount,
          state: 'running',
          startedAt: evSec,
          finishedAt: null,
        });
        state = 'waiting_gate';
      } else if (op === 'complete') {
        state = 'completed';
      }
    }

    let outputs;
    let workflowState = { reworks: reworkCount };
    let finishedAt = null;

    if (preset === 'code-review') {
      outputs = buildCodeReviewOutputs(tMs);
      if (state === 'completed') finishedAt = BASE_EPOCH + 17;
    } else {
      const approved = postGateMode === 'approve';
      const built = buildFeatureShipOutputs(tMs, reworkCount, approved);
      outputs = built.outputs;
      workflowState.candidate = built.candidate;

      if (postGateMode === 'reject') {
        pausedGate = null;
        if (postGateTimerMs < 4500) {
          state = 'running';
          nodeRecords.set('human_gate', {
            nodeId: 'human_gate',
            iteration: 1 + reworkCount,
            round: 1 + reworkCount,
            state: 'completed',
            startedAt: BASE_EPOCH + 53,
            finishedAt: BASE_EPOCH + 57,
          });
          nodeRecords.set('rework', {
            nodeId: 'rework',
            iteration: reworkCount + 1,
            round: 1 + reworkCount,
            state: postGateTimerMs < 2500 ? 'running' : 'completed',
            startedAt: BASE_EPOCH + 57,
            finishedAt: postGateTimerMs < 2500 ? null : BASE_EPOCH + 60,
          });
          if (postGateTimerMs >= 2500) {
            nodeRecords.set('reverify', {
              nodeId: 'reverify',
              iteration: reworkCount + 1,
              round: 1 + reworkCount,
              state: 'running',
              startedAt: BASE_EPOCH + 60,
              finishedAt: null,
            });
          }
        } else {
          // Rework complete -> increment reworkCount and return to waiting_gate
          reworkCount += 1;
          postGateMode = null;
          postGateTimerMs = 0;
          state = 'waiting_gate';
          workflowState.reworks = reworkCount;
          nodeRecords.set('rework', {
            nodeId: 'rework',
            iteration: reworkCount,
            round: reworkCount,
            state: 'completed',
            startedAt: BASE_EPOCH + 57,
            finishedAt: BASE_EPOCH + 60,
          });
          nodeRecords.set('reverify', {
            nodeId: 'reverify',
            iteration: reworkCount,
            round: reworkCount,
            state: 'completed',
            startedAt: BASE_EPOCH + 60,
            finishedAt: BASE_EPOCH + 62,
          });
          nodeRecords.set('human_gate', {
            nodeId: 'human_gate',
            iteration: 1 + reworkCount,
            round: 1 + reworkCount,
            state: 'running',
            startedAt: BASE_EPOCH + 62,
            finishedAt: null,
          });
        }
      } else if (postGateMode === 'approve') {
        const postBase = 57000;
        const curMs = postBase + postGateTimerMs;
        const builtPost = buildFeatureShipOutputs(curMs, reworkCount, true);
        outputs = builtPost.outputs;
        workflowState.candidate = builtPost.candidate;
        nodeRecords.set('human_gate', {
          nodeId: 'human_gate',
          iteration: 1 + reworkCount,
          round: 1 + reworkCount,
          state: 'completed',
          startedAt: BASE_EPOCH + 53,
          finishedAt: BASE_EPOCH + 57,
        });
        const postSteps = [
          ['ship', 57000, 61000],
          ['retro', 61000, 64000],
          ['distill', 64000, 69000],
          ['record', 69000, 71000],
          ['finish', 71000, 71500],
        ];
        state = curMs >= 71500 ? 'completed' : 'running';
        if (state === 'completed') finishedAt = BASE_EPOCH + 72;
        for (const [id, sMs, eMs] of postSteps) {
          if (curMs < sMs) break;
          nodeRecords.set(id, {
            nodeId: id,
            iteration: 1,
            round: 1 + reworkCount,
            state: curMs >= eMs ? 'completed' : 'running',
            startedAt: BASE_EPOCH + Math.floor(sMs / 1000),
            finishedAt: curMs >= eMs ? BASE_EPOCH + Math.floor(eMs / 1000) : null,
          });
        }
      }

      if (state === 'waiting_gate') {
        pausedGate = {
          nodeId: 'human_gate',
          prompt: 'Accept 4/5 unit(s) in current worktree (main)?',
          inputs: {},
          state: { ...workflowState },
          outputs,
        };
      }
    }

    const demoNowSec =
      postGateMode === 'approve'
        ? BASE_EPOCH + Math.floor((57000 + postGateTimerMs) / 1000)
        : BASE_EPOCH + Math.floor(tMs / 1000);

    const run = {
      runId: preset === 'code-review' ? '4a9c0022-demo' : '7f3a0011-demo',
      origin: 'demo',
      deckId: 'hanakoxbt-loops-and-graphs',
      sessionId: 'demo-session',
      worktreeId: 'demo-wt',
      workflowId: preset,
      state,
      detail: state === 'waiting_gate' ? 'waiting at human_gate' : '',
      round: 1 + reworkCount,
      currentNodes: [],
      pausedGate,
      inputs:
        preset === 'code-review'
          ? { base: '', checkCmd: 'pnpm test' }
          : { requirement: getDemoGoal('feature-ship'), fullCheckCmd: 'pnpm test' },
      outputs,
      workflowState,
      startedAt: BASE_EPOCH,
      finishedAt,
      nodes: Array.from(nodeRecords.values()),
    };

    return { run, byUnit, nowSec: demoNowSec };
  }

  function commitFrame(tMs) {
    const st = store.get();
    const preset = st.preset;
    const { run, byUnit, nowSec } = synthesizeSnapshot(preset, tMs);
    store.set(s => ({
      ...s,
      mode: 'demo',
      goal: preset === 'feature-ship' ? getDemoGoal('feature-ship') : s.goal,
      run,
      telemetry: {
        rev: s.telemetry.rev + 1,
        byUnit,
        lastSeq: 0,
      },
      ui: {
        ...s.ui,
        demoFrame: tMs,
        tick: nowSec,
      },
    }));
  }

  function step(rafTs) {
    if (!active) return;
    if (document.hidden) {
      lastFrameTs = null;
      rafId = requestAnimationFrame(step);
      return;
    }
    const st = store.get();
    if (st.mode !== 'demo') {
      stop();
      return;
    }

    if (lastFrameTs === null) {
      lastFrameTs = rafTs;
      rafId = requestAnimationFrame(step);
      return;
    }

    const speed = st.ui.demoSpeed || 1;
    const dt = Math.min(200, rafTs - lastFrameTs) * speed;
    lastFrameTs = rafTs;

    if (postGateMode === 'approve' || postGateMode === 'reject') {
      postGateTimerMs += dt;
      commitFrame(st.ui.demoFrame);
      if (postGateMode === 'approve' && postGateTimerMs >= 15000) {
        active = false;
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(step);
      return;
    }

    const nextT = st.ui.demoFrame + dt;
    const maxT = st.preset === 'code-review' ? 16500 : 56000;
    if (nextT >= maxT) {
      commitFrame(maxT);
      active = false;
      rafId = null;
      return;
    }

    // Throttle store updates cleanly to ~12fps during playback while keeping smooth clock
    if (Math.floor(nextT / 150) !== Math.floor(st.ui.demoFrame / 150)) {
      commitFrame(nextT);
    } else {
      store.set(s => ({ ...s, ui: { ...s.ui, demoFrame: nextT } }));
    }
    rafId = requestAnimationFrame(step);
  }

  function startPlayback() {
    if (rafId) cancelAnimationFrame(rafId);
    active = true;
    lastFrameTs = null;
    rafId = requestAnimationFrame(step);
  }

  let injectedDemoLessons = false;

  function start(presetOverride) {
    postGateMode = null;
    postGateTimerMs = 0;
    reworkCount = 0;
    const preset = presetOverride || store.get().preset || 'feature-ship';
    const demoLessons = getDemoConstraints();
    const hadLessons = store.get().lessons.list.length > 0;
    if (!hadLessons) injectedDemoLessons = true;
    store.set(s => ({
      ...s,
      mode: 'demo',
      preset,
      lessons: s.lessons.list.length ? s.lessons : { rev: s.lessons.rev + 1, list: demoLessons },
      selection: null,
      ui: { ...s.ui, demoFrame: 0, demoPaused: false },
    }));
    commitFrame(0);
    startPlayback();
  }

  function seek(target = 'gate', opts = {}) {
    postGateMode = null;
    postGateTimerMs = 0;
    reworkCount = 0;
    const st = store.get();
    const preset = opts.preset || st.preset || 'feature-ship';
    const tMs = target === 'gate' ? (preset === 'code-review' ? 16200 : 56000) : Number(target) || 0;
    const demoLessons = getDemoConstraints();
    if (!st.lessons.list.length) injectedDemoLessons = true;

    // Synchronous setup for preview/snapshot stability
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    active = false;

    const { run, byUnit, nowSec } = synthesizeSnapshot(preset, tMs);
    store.set(s => ({
      ...s,
      mode: 'demo',
      preset,
      goal: preset === 'feature-ship' ? getDemoGoal('feature-ship') : s.goal,
      run,
      telemetry: { rev: s.telemetry.rev + 1, byUnit, lastSeq: 0 },
      lessons: s.lessons.list.length ? s.lessons : { rev: s.lessons.rev + 1, list: demoLessons },
      selection: target === 'gate' && preset === 'feature-ship' ? { kind: 'node', id: 'human_gate' } : null,
      ui: {
        ...s.ui,
        demoFrame: tMs,
        tick: nowSec,
        inspectorOpen: true,
        tab: target === 'gate' && preset === 'feature-ship' ? 'gate' : s.ui.tab,
      },
    }));
  }

  function restart() {
    start(store.get().preset);
  }

  function setSpeed(speed) {
    store.set(s => ({
      ...s,
      prefs: { ...s.prefs, demoSpeed: speed },
      ui: { ...s.ui, demoSpeed: speed },
    }));
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    active = false;
    postGateMode = null;
    postGateTimerMs = 0;
    reworkCount = 0;
    const clearDemoLessons = injectedDemoLessons;
    injectedDemoLessons = false;
    store.set(s => ({
      ...s,
      mode: 'idle',
      run: null,
      goal: '',
      selection: null,
      lessons: clearDemoLessons ? { rev: s.lessons.rev + 1, list: [] } : s.lessons,
      telemetry: { rev: s.telemetry.rev + 1, byUnit: {}, lastSeq: 0 },
    }));
  }

  function handleGateDecision(decision) {
    if (decision === 'approve') {
      postGateMode = 'approve';
      postGateTimerMs = 0;
      startPlayback();
    } else if (decision === 'reject') {
      postGateMode = 'reject';
      postGateTimerMs = 0;
      startPlayback();
    }
  }

  return {
    start,
    seek,
    restart,
    setSpeed,
    stop,
    handleGateDecision,
  };
}
