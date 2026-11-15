const PREFIX = '⟦ag⟧';

export function normalizeEpochSec(ts) {
  if (ts === null || ts === undefined) return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

export function parseNotice(ev, minEpochSec = 0) {
  if (!ev || ev.kind !== 'notice') return null;
  const raw = (ev.payload && ev.payload.message) ?? ev.text ?? '';
  const idx = typeof raw === 'string' ? raw.indexOf(PREFIX) : -1;
  if (idx === -1) return null;
  let msg;
  try {
    msg = JSON.parse(raw.slice(idx + PREFIX.length));
  } catch {
    return null;
  }
  if (!msg || msg.v !== 1 || !msg.u || !msg.p) return null;
  const t = normalizeEpochSec(ev.timestamp) ?? Math.floor(Date.now() / 1000);
  if (minEpochSec && t < minEpochSec) return null;
  return {
    u: String(msg.u),
    p: String(msg.p),
    s: String(msg.s || 'info'),
    a: Number(msg.a) || 0,
    m: String(msg.m || ''),
    t,
  };
}

function ensureUnit(byUnit, id, isReview = false) {
  if (!byUnit[id]) {
    byUnit[id] = {
      id,
      status: 'pending',
      phases: isReview
        ? ['pending', 'pending', 'pending']
        : ['pending', 'pending', 'pending', 'pending', 'pending'],
      attempts: { red: [], green: [], evidence: [] },
      events: [],
      conflict: false,
      startedAt: null,
      finishedAt: null,
    };
  }
  return byUnit[id];
}

export function applyNoticeToMap(byUnit, notice, preset = 'feature-ship') {
  const isReview = preset === 'code-review';
  const rec = ensureUnit(byUnit, notice.u, isReview);
  rec.events = [...rec.events, notice];
  const { p, s, a, t } = notice;

  if (isReview) {
    // Phases: [REVIEW(0), EVIDENCE(1), GATE(2)]
    if (p === 'start') {
      rec.status = 'running';
      rec.startedAt = rec.startedAt ?? t;
      rec.phases[0] = 'running';
    } else if (p === 'evidence') {
      const idx = Math.max(0, (a || 1) - 1);
      rec.attempts.evidence[idx] = s === 'pass' ? 'pass' : 'fail';
      if (s === 'pass') {
        rec.phases[0] = 'pass';
        rec.phases[1] = 'pass';
        rec.phases[2] = 'pass';
        rec.status = 'pass';
        rec.finishedAt = t;
      } else {
        rec.phases[1] = 'fail';
        if (a >= 2) {
          rec.phases[2] = 'fail';
          rec.status = 'fail';
          rec.finishedAt = t;
        } else {
          rec.phases[0] = 'running';
          rec.phases[2] = 'pending';
        }
      }
    } else if (p === 'done') {
      rec.phases = ['pass', 'pass', 'pass'];
      rec.status = s === 'fail' ? 'fail' : 'pass';
      rec.finishedAt = t;
    }
    return;
  }

  // Feature-ship phases: [CHECK(0), RED(1), IMPL(2), GREEN(3), COMMIT(4)]
  if (p === 'queued') {
    if (rec.status === 'pending') {
      rec.phases = ['pending', 'pending', 'pending', 'pending', 'pending'];
    }
  } else if (p === 'start') {
    rec.status = 'running';
    rec.startedAt = rec.startedAt ?? t;
    rec.phases[0] = 'running';
  } else if (p === 'red') {
    const idx = Math.max(0, (a || 1) - 1);
    rec.attempts.red[idx] = s === 'pass' ? 'pass' : 'fail';
    if (s === 'pass') {
      rec.phases[0] = 'pass';
      rec.phases[1] = 'pass';
      rec.phases[2] = 'running';
    } else if (a >= 2) {
      rec.phases[0] = 'pass';
      rec.phases[1] = 'fail';
      rec.phases[2] = 'skip';
      rec.phases[3] = 'skip';
      rec.phases[4] = 'skip';
      rec.status = 'fail';
      rec.finishedAt = t;
    } else {
      rec.phases[0] = 'running';
      rec.phases[1] = 'fail';
    }
  } else if (p === 'green') {
    const idx = Math.max(0, (a || 1) - 1);
    rec.attempts.green[idx] = s === 'pass' ? 'pass' : 'fail';
    if (s === 'pass') {
      rec.phases[2] = 'pass';
      rec.phases[3] = 'pass';
      rec.phases[4] = 'running';
    } else if (a >= 3) {
      rec.phases[2] = 'pass';
      rec.phases[3] = 'fail';
      rec.phases[4] = 'skip';
      rec.status = 'fail';
      rec.finishedAt = t;
    } else {
      rec.phases[2] = 'running';
      rec.phases[3] = 'fail';
    }
  } else if (p === 'done') {
    rec.phases = ['pass', 'pass', 'pass', 'pass', 'pass'];
    rec.status = 'pass';
    rec.finishedAt = t;
  } else if (p === 'merge' && s === 'fail') {
    rec.conflict = true;
  }
}

export function applyNoticesBatch(store, events, minEpochSec, preset) {
  if (!events || !events.length) return;
  const cur = store.get().telemetry;
  const nextByUnit = {};
  for (const [k, v] of Object.entries(cur.byUnit)) {
    nextByUnit[k] = {
      ...v,
      phases: [...v.phases],
      attempts: {
        red: [...v.attempts.red],
        green: [...v.attempts.green],
        evidence: [...(v.attempts.evidence || [])],
      },
      events: [...v.events],
    };
  }
  let changed = false;
  for (const ev of events) {
    const parsed = parseNotice(ev, minEpochSec);
    if (!parsed) continue;
    applyNoticeToMap(nextByUnit, parsed, preset);
    changed = true;
  }
  if (!changed) return;
  store.set(s => ({
    ...s,
    telemetry: {
      rev: s.telemetry.rev + 1,
      byUnit: nextByUnit,
      lastSeq: s.telemetry.lastSeq,
    },
  }));
}

export function createTelemetryController(store, safe) {
  let activeSessionId = null;
  let activeRunId = null;
  let unsubFn = null;
  let stopTimer = null;

  function minEpochOf(run) {
    if (!run) return 0;
    const nodeTimes = (run.nodes || [])
      .map(n => normalizeEpochSec(n.startedAt))
      .filter(Boolean);
    if (nodeTimes.length) return Math.min(...nodeTimes);
    return normalizeEpochSec(run.startedAt) || 0;
  }

  function unsubscribeNow() {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    if (unsubFn) {
      try {
        unsubFn();
      } catch {
        // ignore unsubscribe errors
      }
      unsubFn = null;
    }
    activeSessionId = null;
  }

  function reset() {
    unsubscribeNow();
    activeRunId = null;
    store.set(s => ({
      ...s,
      telemetry: { rev: s.telemetry.rev + 1, byUnit: {}, lastSeq: 0 },
    }));
  }

  function scheduleDelayedUnsubscribe() {
    if (stopTimer || !unsubFn) return;
    stopTimer = setTimeout(() => {
      stopTimer = null;
      unsubscribeNow();
    }, 2000);
  }

  async function syncRun(run) {
    if (!run || store.get().mode === 'demo') return;
    if (run.runId !== activeRunId) {
      unsubscribeNow();
      activeRunId = run.runId;
      store.set(s => ({
        ...s,
        telemetry: { rev: s.telemetry.rev + 1, byUnit: {}, lastSeq: 0 },
      }));
    }

    const active = run.state === 'running' || run.state === 'waiting_gate';
    if (!active) {
      scheduleDelayedUnsubscribe();
      return;
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }

    const caps = store.get().caps;
    if (caps.agent === false || !run.sessionId) return;
    if (activeSessionId === run.sessionId && unsubFn) return;

    unsubscribeNow();
    activeSessionId = run.sessionId;
    const preset = run.workflowId || store.get().preset;
    const minSec = minEpochOf(run);

    const res = await safe(
      () => window.deck.agent.logs(run.sessionId, { afterSeq: 0 }),
      'agent',
    );
    if (res.ok && res.v) {
      const evs = res.v.events || [];
      if (evs.length) applyNoticesBatch(store, evs, minSec, preset);
      if (typeof res.v.lastSeq === 'number') {
        store.set(s => ({
          ...s,
          telemetry: { ...s.telemetry, lastSeq: res.v.lastSeq },
        }));
      }
    }
    if (store.get().caps.agent === false) return;

    if (typeof window.deck?.agent?.onEvent === 'function') {
      try {
        unsubFn = window.deck.agent.onEvent(run.sessionId, msg => {
          const curRun = store.get().run;
          if (!curRun || curRun.runId !== run.runId) return;
          const evs = (msg && msg.events) || [];
          applyNoticesBatch(store, evs, minEpochOf(curRun), curRun.workflowId || store.get().preset);
          if (msg && typeof msg.lastSeq === 'number') {
            store.set(s => ({
              ...s,
              telemetry: { ...s.telemetry, lastSeq: msg.lastSeq },
            }));
          }
        });
      } catch {
        // graceful no-op if onEvent fails
      }
    }
  }

  return { syncRun, reset, unsubscribeNow };
}
