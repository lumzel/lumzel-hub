import { getTopology } from './topology/index.js';
import { normalizeEpochSec } from './telemetry.js';
import { parseJsonSafe } from './lib/format.js';

let memoKey = null;
let memoView = null;

function mapNodeStatus(rec, run, nodeId) {
  if (run.pausedGate && run.pausedGate.nodeId === nodeId && run.state === 'waiting_gate') {
    return 'waiting';
  }
  const terminal = ['completed', 'failed', 'stopped', 'limit', 'interrupted'].includes(run.state);
  if (!rec) {
    return terminal ? 'skipped' : 'queued';
  }
  if (rec.state === 'running') {
    if (run.state === 'stopped' || run.state === 'interrupted') return 'stopped';
    return 'running';
  }
  if (rec.state === 'completed') return 'ok';
  if (rec.state === 'failed') return 'fail';
  return 'queued';
}

function pickLatestNodes(run) {
  const map = new Map();
  for (const n of run.nodes || []) {
    const prev = map.get(n.nodeId);
    if (!prev || (n.iteration || 1) >= (prev.iteration || 1)) {
      map.set(n.nodeId, n);
    }
  }
  return map;
}

function resolveGateRoute(nodeId, nodesMap, run, edges) {
  const gateRec = nodesMap.get(nodeId);
  if (!gateRec || gateRec.state !== 'completed') return null;
  const gEnd = normalizeEpochSec(gateRec.finishedAt) || normalizeEpochSec(gateRec.startedAt) || 0;
  const outEdges = edges.filter(e => e.from === nodeId && e.to);
  let best = null;
  let bestStart = Infinity;
  for (const e of outEdges) {
    const targetRec = nodesMap.get(e.to);
    if (!targetRec) continue;
    const tStart = normalizeEpochSec(targetRec.startedAt) || 0;
    if (tStart >= gEnd && tStart < bestStart) {
      bestStart = tStart;
      best = e.to;
    }
  }
  if (best) return best;

  // Fallback inference from known outputs if timestamps tie
  if (nodeId === 'preflight_gate') {
    const pre = (run.outputs && run.outputs.preflight) || {};
    if (pre.presetUnits && pre.presetUnits.length > 0 && nodesMap.has('plan')) return 'plan';
    if (nodesMap.has('split')) return 'split';
  }
  if (nodeId === 'integrate_gate') {
    const integ = (run.outputs && run.outputs.integrate) || {};
    if (integ.shippable === false && nodesMap.has('retro')) return 'retro';
    if (nodesMap.has('human_gate')) return 'human_gate';
  }
  return null;
}

function buildFeatureShipLanes(run, telemetryByUnit) {
  const outputs = run.outputs || {};
  const planUnits = (outputs.plan && outputs.plan.units) || [];
  const results = (outputs.units && outputs.units.results) || [];
  const integ = outputs.integrate || {};
  const conflictedIds = new Set((integ.conflicted || []).map(c => c.id));

  if (!planUnits.length) {
    // Blueprint 3 placeholder lanes
    return [0, 1, 2].map(i => ({
      id: `unit-${i + 1}`,
      title: '—',
      branch: '',
      status: 'pending',
      phases: ['pending', 'pending', 'pending', 'pending'],
      attempts: { red: [], green: [] },
      conflict: false,
      error: '',
      item: null,
      result: null,
      events: [],
      startedAt: null,
      finishedAt: null,
      blueprint: true,
    }));
  }

  const resById = new Map();
  for (const r of results) {
    if (r && r.item && r.item.id) resById.set(r.item.id, r);
  }

  return planUnits.map(u => {
    const r = resById.get(u.id);
    const tel = telemetryByUnit[u.id];
    const isConflicted = conflictedIds.has(u.id) || Boolean(tel && tel.conflict);

    if (r) {
      const o = r.outputs || {};
      const redGate = o.red_gate || {};
      const greenGate = o.green_gate || {};
      const redAttempts = Number(redGate.attempt) || 0;
      const greenAttempts = Number(greenGate.attempt) || 0;
      const redList =
        tel && tel.attempts.red.length
          ? tel.attempts.red
          : Array.from({ length: redAttempts }, (_, idx) =>
              idx === redAttempts - 1 && redGate.ok !== false ? 'pass' : 'fail',
            );
      const greenList =
        tel && tel.attempts.green.length
          ? tel.attempts.green
          : Array.from({ length: greenAttempts }, (_, idx) =>
              idx === greenAttempts - 1 && greenGate.ok !== false ? 'pass' : 'fail',
            );

      let phases;
      if (r.ok) {
        phases = ['pass', 'pass', 'pass', 'pass'];
      } else if (redGate.ok === false) {
        phases = ['pass', 'fail', 'skip', 'skip'];
      } else {
        phases = ['pass', 'pass', 'pass', 'fail'];
      }

      const error =
        r.error ||
        (redGate.ok === false ? redGate.reason : '') ||
        (greenGate.ok === false ? greenGate.signature || greenGate.reason : '') ||
        '';

      return {
        id: u.id,
        title: u.title || u.id,
        branch: r.branch || '',
        status: r.ok ? 'pass' : 'fail',
        phases,
        attempts: { red: redList, green: greenList },
        conflict: isConflicted,
        error,
        item: u,
        result: r,
        events: (tel && tel.events) || [],
        startedAt: (o.lane_start && o.lane_start.startedAt) || (tel && tel.startedAt) || null,
        finishedAt: (tel && tel.finishedAt) || null,
        blueprint: false,
      };
    }

    if (tel) {
      return {
        id: u.id,
        title: u.title || u.id,
        branch: '',
        status: tel.status || 'pending',
        phases: tel.phases || ['pending', 'pending', 'pending', 'pending'],
        attempts: { red: tel.attempts.red || [], green: tel.attempts.green || [] },
        conflict: isConflicted,
        error: '',
        item: u,
        result: null,
        events: tel.events || [],
        startedAt: tel.startedAt,
        finishedAt: tel.finishedAt,
        blueprint: false,
      };
    }

    return {
      id: u.id,
      title: u.title || u.id,
      branch: '',
      status: 'pending',
      phases: ['pending', 'pending', 'pending', 'pending'],
      attempts: { red: [], green: [] },
      conflict: false,
      error: '',
      item: u,
      result: null,
      events: [],
      startedAt: null,
      finishedAt: null,
      blueprint: false,
    };
  });
}

function buildCodeReviewLanes(run, telemetryByUnit) {
  const outputs = run.outputs || {};
  const scopeLenses = (outputs.scope && outputs.scope.lenses) || [];
  const results = (outputs.lenses && outputs.lenses.results) || [];

  if (!scopeLenses.length) {
    const defaults = ['correctness', 'security', 'performance', 'tests'];
    return defaults.map(id => ({
      id,
      title: '—',
      branch: '',
      status: 'pending',
      phases: ['pending', 'pending', 'pending'],
      attempts: { evidence: [] },
      conflict: false,
      error: '',
      item: null,
      result: null,
      events: [],
      startedAt: null,
      finishedAt: null,
      blueprint: true,
    }));
  }

  const resById = new Map();
  for (const r of results) {
    if (r && r.item && r.item.id) resById.set(r.item.id, r);
  }

  return scopeLenses.map(lens => {
    const r = resById.get(lens.id);
    const tel = telemetryByUnit[lens.id];
    if (r) {
      const ev = (r.outputs && r.outputs.evidence) || {};
      const evAttempts = Number(ev.attempt) || 1;
      const evList =
        tel && tel.attempts.evidence && tel.attempts.evidence.length
          ? tel.attempts.evidence
          : Array.from({ length: evAttempts }, (_, idx) =>
              idx === evAttempts - 1 && r.ok ? 'pass' : 'fail',
            );
      return {
        id: lens.id,
        title: lens.focus || lens.id,
        branch: '',
        status: r.ok ? 'pass' : 'fail',
        phases: r.ok ? ['pass', 'pass', 'pass'] : ['pass', 'fail', 'fail'],
        attempts: { evidence: evList },
        conflict: false,
        error: r.error || (ev.feedback ? ev.feedback.split('\n')[0] : ''),
        item: lens,
        result: r,
        events: (tel && tel.events) || [],
        startedAt: tel && tel.startedAt,
        finishedAt: tel && tel.finishedAt,
        blueprint: false,
      };
    }

    if (tel) {
      return {
        id: lens.id,
        title: lens.focus || lens.id,
        branch: '',
        status: tel.status || 'pending',
        phases: tel.phases || ['pending', 'pending', 'pending'],
        attempts: { evidence: tel.attempts.evidence || [] },
        conflict: false,
        error: '',
        item: lens,
        result: null,
        events: tel.events || [],
        startedAt: tel.startedAt,
        finishedAt: tel.finishedAt,
        blueprint: false,
      };
    }

    return {
      id: lens.id,
      title: lens.focus || lens.id,
      branch: '',
      status: 'pending',
      phases: ['pending', 'pending', 'pending'],
      attempts: { evidence: [] },
      conflict: false,
      error: '',
      item: lens,
      result: null,
      events: [],
      startedAt: null,
      finishedAt: null,
      blueprint: false,
    };
  });
}

function buildBlueprintView(preset, nowSec) {
  const topo = getTopology(preset);
  const nodes = {};
  for (const [id, meta] of Object.entries(topo.META)) {
    nodes[id] = {
      id,
      role: meta.role,
      kind: meta.kind,
      status: 'queued',
      iteration: 0,
      max: meta.max,
      startedAt: null,
      finishedAt: null,
      durationSec: null,
      input: null,
      output: null,
      error: '',
      sessionId: '',
      worktreePath: '',
      route: null,
    };
  }
  const lanes =
    preset === 'code-review'
      ? buildCodeReviewLanes({ outputs: {} }, {})
      : buildFeatureShipLanes({ outputs: {} }, {});

  const edges = {};
  const layoutObj = topo.layout(lanes.length);
  for (const e of topo.buildEdges(layoutObj, { lanes, summary: {} })) {
    edges[e.id] =
      e.kind === 'correct' || e.routeBranch
        ? 'ghost'
        : e.kind === 'learn'
          ? 'idle'
          : 'idle';
  }

  return {
    blueprint: true,
    preset,
    runId: null,
    state: 'idle',
    detail: '',
    round: 0,
    startedAt: null,
    finishedAt: null,
    elapsedSec: null,
    nowSec,
    nodes,
    lanes,
    edges,
    gate: null,
    verdict: null,
    lessonsProposed: [],
    summary: {
      units: 0,
      passed: 0,
      failed: 0,
      running: 0,
      retries: 0,
      reworks: 0,
      constraints: null,
      files: 0,
    },
    telemetryUnavailable: false,
  };
}

export function derive(run, preset, telemetryRev, telemetryByUnit, nowSec) {
  const effPreset = (run && run.workflowId) || preset || 'feature-ship';
  if (
    memoKey &&
    memoKey.run === run &&
    memoKey.preset === effPreset &&
    memoKey.telemetryRev === telemetryRev &&
    memoKey.nowSec === nowSec &&
    memoView
  ) {
    return memoView;
  }

  if (!run) {
    const bp = buildBlueprintView(effPreset, nowSec);
    memoKey = { run: null, preset: effPreset, telemetryRev, nowSec };
    memoView = bp;
    return bp;
  }

  const topo = getTopology(effPreset);
  const nodesMap = pickLatestNodes(run);
  const outputs = run.outputs || {};
  const wfState = run.workflowState || {};

  const nodeTimes = (run.nodes || [])
    .map(n => normalizeEpochSec(n.startedAt))
    .filter(Boolean);
  const firstStarted = nodeTimes.length
    ? Math.min(...nodeTimes)
    : normalizeEpochSec(run.startedAt);
  const finSec = normalizeEpochSec(run.finishedAt);
  const elapsedSec =
    firstStarted !== null
      ? Math.max(0, (finSec !== null ? finSec : nowSec) - firstStarted)
      : null;

  const lanes =
    effPreset === 'code-review'
      ? buildCodeReviewLanes(run, telemetryByUnit || {})
      : buildFeatureShipLanes(run, telemetryByUnit || {});

  const layoutObj = topo.layout(lanes.length);
  const edgeDefs = topo.buildEdges(layoutObj, {
    lanes,
    summary: {
      passed: lanes.filter(l => l.status === 'pass').length,
      files: (outputs.scope && outputs.scope.files && outputs.scope.files.length) || 0,
    },
  });

  const nodes = {};
  const knownIds = new Set(Object.keys(topo.META));
  for (const k of nodesMap.keys()) knownIds.add(k);

  for (const id of knownIds) {
    const meta = topo.META[id] || { role: 'code', kind: 'NODE', max: 1 };
    const rec = nodesMap.get(id);
    const status = mapNodeStatus(rec, run, id);
    const sAt = rec ? normalizeEpochSec(rec.startedAt) : null;
    const fAt = rec ? normalizeEpochSec(rec.finishedAt) : null;
    const dur =
      sAt !== null
        ? Math.max(
            0,
            (fAt !== null ? fAt : status === 'running' || status === 'waiting' ? nowSec : sAt) - sAt,
          )
        : null;

    const output = outputs[id] !== undefined ? outputs[id] : rec ? parseJsonSafe(rec.outputJson) : null;
    const input = rec ? parseJsonSafe(rec.inputJson) : null;

    nodes[id] = {
      id,
      role: meta.role,
      kind: meta.kind,
      status,
      iteration: (rec && rec.iteration) || 0,
      max: meta.max || 1,
      startedAt: sAt,
      finishedAt: fAt,
      durationSec: dur,
      input,
      output,
      error: (rec && rec.error) || '',
      sessionId: (rec && rec.sessionId) || '',
      worktreePath: (rec && rec.worktreePath) || '',
      route: meta.role === 'gate' ? resolveGateRoute(id, nodesMap, run, edgeDefs) : null,
    };
  }

  // Edge visual states (§9.3 rule 6)
  const edges = {};
  const reworks = Number(wfState.reworks) || 0;
  const lessonsProposed =
    (outputs.record && outputs.record.lessons) ||
    (outputs.learn && outputs.learn.lessons) ||
    [];

  for (const e of edgeDefs) {
    if (e.kind === 'learn') {
      edges[e.id] = lessonsProposed.length > 0 ? 'armed' : 'idle';
      continue;
    }
    if (e.kind === 'correct') {
      const target = nodes[e.to];
      const taken = reworks > 0 || (target && target.iteration > 0 && (e.from === 'human_gate' ? nodes.rework?.status !== 'queued' && nodes.rework?.status !== 'skipped' : true));
      if (nodes[e.to]?.status === 'running' && nodes[e.from]?.status !== 'queued') {
        edges[e.id] = 'active';
      } else {
        edges[e.id] = taken ? 'taken' : 'ghost';
      }
      continue;
    }

    const src = nodes[e.from];
    if (!src) {
      edges[e.id] = 'idle';
      continue;
    }

    // Special handling for gate branching edges
    if (src.role === 'gate') {
      if (e.to === null && e.id === 'cr_done') {
        const doneShortCircuit =
          src.status === 'ok' &&
          outputs.scope &&
          Array.isArray(outputs.scope.files) &&
          outputs.scope.files.length === 0;
        edges[e.id] = doneShortCircuit ? 'done' : 'ghost';
        continue;
      }
      if (src.status === 'ok' && src.route) {
        // Check if this edge matches the actual route, or parallel fork for code-review
        if (effPreset === 'code-review' && src.route !== null && (e.to === 'lenses' || e.to === 'checks')) {
          const dst = nodes[e.to];
          edges[e.id] =
            dst && dst.status === 'running'
              ? 'active'
              : dst && dst.status !== 'queued' && dst.status !== 'skipped'
                ? 'done'
                : 'idle';
          continue;
        }
        if (e.to !== src.route) {
          edges[e.id] = 'ghost';
          continue;
        }
      } else if (e.routeBranch) {
        edges[e.id] = 'ghost';
        continue;
      }
    }

    const dst = e.to ? nodes[e.to] : null;
    if (src.status === 'ok' && dst) {
      if (dst.status === 'running' || dst.status === 'waiting') {
        edges[e.id] = 'active';
      } else if (dst.status !== 'queued' && dst.status !== 'skipped') {
        edges[e.id] = 'done';
      } else {
        edges[e.id] = 'idle';
      }
    } else {
      edges[e.id] = e.routeBranch ? 'ghost' : 'idle';
    }
  }

  // Gate view
  let gate = null;
  if (run.state === 'waiting_gate' && run.pausedGate && run.pausedGate.nodeId === 'human_gate') {
    const pg = run.pausedGate;
    const pgState = pg.state || wfState || {};
    const candidate = pgState.candidate || wfState.candidate || null;
    const reworksNow = Number(pgState.reworks ?? wfState.reworks) || 0;
    const gateNode = nodes.human_gate;
    const waitStart = (gateNode && gateNode.startedAt) || firstStarted || nowSec;
    gate = {
      nodeId: pg.nodeId,
      prompt: pg.prompt || '',
      candidate,
      integrate: (pg.outputs && pg.outputs.integrate) || outputs.integrate || null,
      reverify: (pg.outputs && pg.outputs.reverify) || outputs.reverify || null,
      reworks: reworksNow,
      reworksLeft: Math.max(0, 2 - reworksNow),
      waitingSinceSec: Math.max(0, nowSec - waitStart),
    };
  }

  // Summary
  const realLanes = lanes.filter(l => !l.blueprint);
  const passed = realLanes.filter(l => l.status === 'pass').length;
  const failed = realLanes.filter(l => l.status === 'fail').length;
  const running = realLanes.filter(l => l.status === 'running').length;

  let retries = 0;
  if (effPreset === 'code-review') {
    const lensRes = (outputs.lenses && outputs.lenses.results) || [];
    if (lensRes.length) {
      retries = lensRes.reduce((acc, r) => acc + (Number(r.retries) || 0), 0);
    } else {
      retries = realLanes.reduce((acc, l) => acc + Math.max(0, (l.attempts.evidence || []).length - 1), 0);
    }
  } else {
    const unitRes = (outputs.units && outputs.units.results) || [];
    if (unitRes.length) {
      retries = unitRes.reduce((acc, r) => acc + (Number(r.retries) || 0), 0);
    } else {
      retries = realLanes.reduce(
        (acc, l) =>
          acc +
          Math.max(0, (l.attempts.red || []).length - 1) +
          Math.max(0, (l.attempts.green || []).length - 1),
        0,
      );
    }
  }

  const verdict = outputs.merge
    ? {
        verdict: outputs.merge.verdict || 'clean',
        counts: outputs.merge.counts || { high: 0, medium: 0, low: 0 },
        findings: outputs.merge.findings || [],
        lensStatus: outputs.merge.lensStatus || [],
        checks: outputs.merge.checks || { skipped: true, ok: null },
        files: outputs.merge.files || 0,
      }
    : null;

  const constraintsInjected =
    outputs.preflight && typeof outputs.preflight.constraintCount === 'number'
      ? outputs.preflight.constraintCount
      : outputs.scope && typeof outputs.scope.constraintCount === 'number'
        ? outputs.scope.constraintCount
        : null;

  const summary = {
    units: realLanes.length,
    passed,
    failed,
    running,
    retries,
    reworks,
    constraints: constraintsInjected,
    files: (outputs.scope && outputs.scope.files && outputs.scope.files.length) || (verdict && verdict.files) || 0,
    verdict: verdict ? verdict.verdict : null,
    counts: verdict ? verdict.counts : null,
    checks: verdict ? verdict.checks : null,
    shipped: Boolean(outputs.ship && outputs.ship.ok),
    checkReason: (outputs.integrate && outputs.integrate.check && outputs.integrate.check.reason) || '',
  };

  const mapNodeId = effPreset === 'code-review' ? 'lenses' : 'units';
  const mapRunning = nodes[mapNodeId] && nodes[mapNodeId].status === 'running';
  const hasTelemetryEvents = Object.keys(telemetryByUnit || {}).length > 0;
  const hasFinalResults =
    effPreset === 'code-review'
      ? Boolean(outputs.lenses && outputs.lenses.results)
      : Boolean(outputs.units && outputs.units.results);
  const telemetryUnavailable = Boolean(mapRunning && !hasTelemetryEvents && !hasFinalResults);

  const view = {
    blueprint: false,
    preset: effPreset,
    runId: run.runId,
    state: run.state,
    detail: run.detail || '',
    round: Number(run.round) || 1,
    startedAt: firstStarted,
    finishedAt: finSec,
    elapsedSec,
    nowSec,
    nodes,
    lanes,
    edges,
    gate,
    verdict,
    lessonsProposed,
    summary,
    telemetryUnavailable,
  };

  memoKey = { run, preset: effPreset, telemetryRev, nowSec };
  memoView = view;
  return view;
}
