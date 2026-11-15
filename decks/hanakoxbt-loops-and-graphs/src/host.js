import { setLocale, t } from './i18n.js';
import { DEFAULT_PREFS } from './store.js';
import { createTelemetryController, normalizeEpochSec } from './telemetry.js';
import { createLessonsController } from './lessons.js';
import { checkTopologyDrift, extractYamlNodeIds } from './topology/layout.js';
import { getTopology } from './topology/index.js';

const BASE_TITLE = 'Loops & Graphs · @hanakoxbt';

export function createHost(store, demo) {
  let workflowUnsub = null;
  let pollTimer = null;
  let lastPushAt = 0;
  let pollNullCount = 0;
  let toastTimer = null;
  let tickTimer = null;
  let prevRunState = null;

  function setCap(key, val) {
    if (!key) return;
    const cur = store.get().caps[key];
    if (cur === val) return;
    store.set(s => ({
      ...s,
      caps: { ...s.caps, [key]: val },
    }));
  }

  async function safe(fn, capKey) {
    try {
      const v = await fn();
      if (capKey) setCap(capKey, true);
      return { ok: true, v };
    } catch (e) {
      const msg = String((e && e.message) || e || '');
      if (capKey && /PermissionDenied/i.test(msg)) {
        setCap(capKey, false);
      }
      return { ok: false, error: msg };
    }
  }

  const telemetry = createTelemetryController(store, safe);
  const lessons = createLessonsController(store, safe);

  function showToast(msg, ms = 3200) {
    if (toastTimer) clearTimeout(toastTimer);
    store.set({ toast: String(msg || '') });
    toastTimer = setTimeout(() => {
      toastTimer = null;
      store.set({ toast: null });
    }, ms);
  }

  function applyContext(ctx) {
    if (!ctx) return;
    const theme = ctx.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    setLocale(ctx.locale || 'zh-CN');
    store.set(s => ({
      ...s,
      ctx: {
        theme,
        locale: ctx.locale || 'zh-CN',
        preview: Boolean(ctx.preview),
        project: ctx.project || '',
        branch: ctx.branch || '',
      },
    }));
  }

  function isActiveState(st) {
    return st === 'running' || st === 'waiting_gate';
  }

  function isTerminalState(st) {
    return ['completed', 'failed', 'stopped', 'limit'].includes(st);
  }

  function buildHistorySummary(run) {
    const out = run.outputs || {};
    const wfState = run.workflowState || {};
    if (run.workflowId === 'code-review') {
      const m = out.merge || {};
      return {
        files: (out.scope && out.scope.files && out.scope.files.length) || m.files || 0,
        verdict: m.verdict || null,
        counts: m.counts || null,
      };
    }
    const res = (out.units && out.units.results) || [];
    const passed = res.filter(r => r && r.ok).length;
    const failed = res.filter(r => r && !r.ok).length;
    const retries = res.reduce((acc, r) => acc + (Number(r && r.retries) || 0), 0);
    return {
      units: res.length || ((out.plan && out.plan.units && out.plan.units.length) || 0),
      passed,
      failed,
      retries,
      reworks: Number(wfState.reworks) || 0,
      shipped: Boolean(out.ship && out.ship.ok),
    };
  }

  async function upsertRunRecord(run, goalOverride) {
    if (!run || !run.runId) return;
    const prev = store.get().history.find(h => h.runId === run.runId);
    const goal =
      goalOverride ??
      (prev && prev.goal) ??
      (run.inputs && run.inputs.requirement) ??
      (run.workflowId === 'code-review' ? `review ${run.inputs?.base || 'HEAD'}` : '');

    const startedAt =
      normalizeEpochSec(run.startedAt) ||
      (prev && prev.startedAt) ||
      Math.floor(Date.now() / 1000);
    const finishedAt = normalizeEpochSec(run.finishedAt);
    const rec = {
      runId: run.runId,
      workflowId: run.workflowId || store.get().preset,
      goal,
      startedAt,
      finishedAt,
      state: run.state,
      detail: run.detail || '',
      constraintIds:
        (run.outputs && run.outputs.preflight && run.outputs.preflight.constraintIds) ||
        (prev && prev.constraintIds) ||
        [],
      summary: buildHistorySummary(run),
    };

    store.set(s => {
      const others = s.history.filter(h => h.runId !== rec.runId);
      const next = [rec, ...others].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      return { ...s, history: next };
    });

    if (store.get().caps.db !== false && window.deck?.store?.put) {
      await safe(() => window.deck.store.put('runs', rec.runId, rec), 'db');
    }
  }

  function clearWorkflowSub() {
    if (workflowUnsub) {
      try {
        workflowUnsub();
      } catch {
        // ignore
      }
      workflowUnsub = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function handleRunSnapshot(nextRun) {
    if (!nextRun) return;
    lastPushAt = Date.now();
    pollNullCount = 0;

    const st = store.get();
    if (st.mode === 'demo' || st.mode === 'inspect') return;

    const prevState = prevRunState;
    prevRunState = nextRun.state;

    const patch = {
      run: nextRun,
      liveRunId: nextRun.runId,
      preset: nextRun.workflowId || st.preset,
    };
    if (st.pending === 'resuming' && nextRun.state !== 'waiting_gate') {
      patch.pending = null;
    }
    if (st.pending === 'stopping' && !isActiveState(nextRun.state)) {
      patch.pending = null;
    }

    if (prevState !== 'waiting_gate' && nextRun.state === 'waiting_gate') {
      document.title = `◆ ${BASE_TITLE}`;
      patch.selection = { kind: 'node', id: 'human_gate' };
      patch.ui = { ...st.ui, inspectorOpen: true, tab: 'gate' };
    } else if (prevState === 'waiting_gate' && nextRun.state !== 'waiting_gate') {
      document.title = BASE_TITLE;
    }

    if (nextRun.state === 'limit') {
      patch.banner = { tone: 'warn', text: t('limitReached') };
    }

    store.set(s => ({ ...s, ...patch }));
    telemetry.syncRun(nextRun);

    if (isTerminalState(nextRun.state) && prevState !== nextRun.state) {
      document.title = BASE_TITLE;
      clearWorkflowSub();
      upsertRunRecord(nextRun);
      lessons.ingestRunResults(nextRun);
    } else if (isActiveState(nextRun.state)) {
      upsertRunRecord(nextRun);
    }
  }

  function subscribeRun(runId) {
    clearWorkflowSub();
    lastPushAt = Date.now();
    pollNullCount = 0;

    if (typeof window.deck?.workflow?.subscribe === 'function') {
      try {
        workflowUnsub = window.deck.workflow.subscribe(runId, msg => {
          const r = msg && (msg.run || msg);
          if (r && r.runId === runId) handleRunSnapshot(r);
        });
      } catch {
        // fallback handled by pollTimer
      }
    }

    // 4s polling fallback (§9.5)
    pollTimer = setInterval(async () => {
      if (document.hidden) return;
      const st = store.get();
      if (st.mode !== 'live' || !st.run || st.run.runId !== runId) return;
      if (!isActiveState(st.run.state)) {
        clearWorkflowSub();
        return;
      }
      if (Date.now() - lastPushAt < 4000) return;
      const res = await safe(() => window.deck.workflow.getRun(runId), 'workflow');
      if (res.ok && res.v) {
        handleRunSnapshot(res.v);
      } else if (res.ok && res.v === null) {
        pollNullCount += 1;
        if (pollNullCount >= 3) {
          clearWorkflowSub();
          store.set({ banner: { tone: 'fail', text: t('runUnavailable') } });
        }
      }
    }, 1500);
  }

  async function savePrefs(patch) {
    const nextPrefs = { ...store.get().prefs, ...patch };
    const UI_PREF_KEYS = ['inspectorOpen', 'inspectorWidth', 'tab', 'timelineOpen', 'follow', 'demoSpeed'];
    store.set(s => {
      const uiPatch = {};
      for (const k of UI_PREF_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          uiPatch[k] = nextPrefs[k];
        }
      }
      return {
        ...s,
        prefs: nextPrefs,
        ui: { ...s.ui, ...uiPatch },
      };
    });
    if (store.get().mode === 'demo' || store.get().caps.db === false) return;
    if (window.deck?.store?.put) {
      await safe(() => window.deck.store.put('prefs', 'ui', nextPrefs), 'db');
    }
  }

  async function checkWorkflowTopology(id) {
    if (!window.deck?.workflow?.get) return;
    const wfRes = await safe(() => window.deck.workflow.get(id), 'workflow');
    if (!wfRes.ok || !wfRes.v || !wfRes.v.yaml) return;
    const topo = getTopology(id);
    const unknown = checkTopologyDrift(wfRes.v.yaml, topo.ALL_YAML_KNOWN_IDS);
    const rootOnlyUnknown = unknown.filter(u => {
      // extractYamlNodeIds finds root & map children; unknown already filtered against ALL_YAML_KNOWN_IDS
      return Boolean(u);
    });
    if (rootOnlyUnknown.length > 0) {
      store.set(s => ({
        ...s,
        workflows: {
          ...s.workflows,
          [id]: { ...(s.workflows[id] || wfRes.v), unknownNodes: rootOnlyUnknown },
        },
      }));
    }
  }

  async function init() {
    // Tick timer (1Hz) for live elapsed time / timeline cursor
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (document.hidden) return;
      const st = store.get();
      if (st.mode === 'live' && st.run && isActiveState(st.run.state)) {
        store.set(s => ({
          ...s,
          ui: { ...s.ui, tick: Math.floor(Date.now() / 1000) },
        }));
      }
    }, 1000);

    document.addEventListener('visibilitychange', async () => {
      document.documentElement.classList.toggle('paused', document.hidden);
      if (!document.hidden && window.deck?.context && !store.get().ctx.preview) {
        const c = await safe(() => window.deck.context());
        if (c.ok && c.v) applyContext(c.v);
      }
    });

    // 1. Context
    if (window.deck?.context) {
      const ctxRes = await safe(() => window.deck.context());
      if (ctxRes.ok && ctxRes.v) {
        applyContext(ctxRes.v);
        if (ctxRes.v.preview) {
          demo.seek('gate');
          return;
        }
      }
    }

    // 2. Parallel startup probes (§9.5 step 3)
    const [prefsRes, lessonsRes, runsRes, wfListRes, fileRes] = await Promise.all([
      window.deck?.store?.list ? safe(() => window.deck.store.list('prefs'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.store?.list ? safe(() => window.deck.store.list('lessons'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.store?.list ? safe(() => window.deck.store.list('runs'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.workflow?.list ? safe(() => window.deck.workflow.list(), 'workflow') : Promise.resolve({ ok: false }),
      window.deck?.files?.read ? safe(() => window.deck.files.read(lessons.LESSONS_FILE), 'files') : Promise.resolve({ ok: false }),
    ]);

    // Prefs
    let mergedPrefs = { ...DEFAULT_PREFS };
    if (prefsRes.ok && Array.isArray(prefsRes.v)) {
      const uiEntry = prefsRes.v.find(e => e && (e.key === 'ui' || e.id === 'ui'));
      const val = uiEntry && (uiEntry.value || uiEntry);
      if (val && typeof val === 'object') {
        mergedPrefs = { ...DEFAULT_PREFS, ...val };
      }
    }

    // Workflows
    const wfMap = {};
    if (wfListRes.ok && Array.isArray(wfListRes.v)) {
      for (const wf of wfListRes.v) {
        if (wf && wf.id) wfMap[wf.id] = wf;
      }
    }

    // History
    const hist = [];
    if (runsRes.ok && Array.isArray(runsRes.v)) {
      for (const entry of runsRes.v) {
        const val = entry && entry.value ? entry.value : entry;
        if (val && val.runId) hist.push(val);
      }
      hist.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    }

    await lessons.load(lessonsRes, fileRes);

    const preset = ['feature-ship', 'code-review'].includes(mergedPrefs.preset)
      ? mergedPrefs.preset
      : 'feature-ship';

    let banner = null;
    const caps = store.get().caps;
    if (caps.workflow === false) {
      banner = { tone: 'warn', text: t('noWorkflowPerm') };
    } else if (caps.db === false) {
      banner = { tone: 'warn', text: t('noDbPerm') };
    } else if (wfMap[preset] && wfMap[preset].error) {
      banner = { tone: 'fail', text: `${preset}: ${wfMap[preset].error}` };
    }

    store.set(s => ({
      ...s,
      mode: 'idle',
      preset,
      workflows: wfMap,
      history: hist,
      prefs: mergedPrefs,
      banner,
      ui: {
        ...s.ui,
        inspectorOpen: mergedPrefs.inspectorOpen !== false,
        inspectorWidth: Math.max(320, Math.min(520, Number(mergedPrefs.inspectorWidth) || 380)),
        tab: mergedPrefs.tab || 'node',
        timelineOpen: Boolean(mergedPrefs.timelineOpen),
        follow: mergedPrefs.follow !== false,
        demoSpeed: mergedPrefs.demoSpeed === 4 ? 4 : 1,
      },
    }));

    // Check YAML vs topology
    checkWorkflowTopology(preset);

    // 5. Recover most recent active run
    const candidate = hist.find(h => h.state === 'running' || h.state === 'waiting_gate');
    if (candidate && caps.workflow !== false && window.deck?.workflow?.getRun) {
      const rRes = await safe(() => window.deck.workflow.getRun(candidate.runId), 'workflow');
      if (rRes.ok && rRes.v) {
        const run = rRes.v;
        prevRunState = run.state;
        if (isActiveState(run.state)) {
          store.set(s => ({
            ...s,
            mode: 'live',
            preset: run.workflowId || s.preset,
            goal: (run.inputs && run.inputs.requirement) || candidate.goal || '',
            run,
            liveRunId: run.runId,
            selection: run.state === 'waiting_gate' ? { kind: 'node', id: 'human_gate' } : s.selection,
            ui:
              run.state === 'waiting_gate'
                ? { ...s.ui, inspectorOpen: true, tab: 'gate' }
                : s.ui,
          }));
          if (run.state === 'waiting_gate') document.title = `◆ ${BASE_TITLE}`;
          subscribeRun(run.runId);
          telemetry.syncRun(run);
        } else if (run.state === 'interrupted') {
          const pausedAtGate = run.pausedGate && run.pausedGate.nodeId === 'human_gate';
          store.set(s => ({
            ...s,
            mode: 'live',
            preset: run.workflowId || s.preset,
            goal: (run.inputs && run.inputs.requirement) || candidate.goal || '',
            run,
            liveRunId: run.runId,
            banner: pausedAtGate
              ? {
                  tone: 'warn',
                  text: t('interruptedGate'),
                  action: { label: t('resumeGate'), fn: () => retryNode('human_gate') },
                }
              : {
                  tone: 'warn',
                  text: t('interrupted'),
                  action: run.currentNodes?.[0]
                    ? { label: t('retryHere'), fn: () => retryNode(run.currentNodes[0]) }
                    : null,
                },
          }));
        } else {
          upsertRunRecord(run);
        }
      }
    }
  }

  async function startRun(opts = {}) {
    const st = store.get();
    if (st.mode === 'demo') demo.stop();
    const preset = opts.preset || st.preset;
    const goal = (opts.goal !== undefined ? opts.goal : st.goal).trim();
    if (preset === 'feature-ship' && !goal && !(opts.units && opts.units.length)) return;
    if (st.caps.workflow === false || !window.deck?.workflow?.run) {
      store.set({ banner: { tone: 'warn', text: t('noWorkflowPerm') } });
      return;
    }

    const activeLessons = lessons.getActiveForPreset(preset);
    const prefs = st.prefs;
    const inputs =
      preset === 'feature-ship'
        ? {
            requirement: goal,
            constraints: activeLessons.map(l => l.text),
            lessonsFile: lessons.LESSONS_FILE,
            fullCheckCmd: prefs.fullCheckCmd || '',
            setupCmd: prefs.setupCmd !== undefined ? prefs.setupCmd : 'auto',
            units: Array.isArray(opts.units) ? opts.units : [],
            maxUnits: opts.units && opts.units.length ? 1 : Number(prefs.maxUnits) || 5,
            commitFlags: prefs.commitFlags || '',
          }
        : {
            base: opts.base !== undefined ? opts.base : prefs.reviewBase || '',
            checkCmd: prefs.reviewCheckCmd || '',
            lenses:
              Array.isArray(prefs.lenses) && prefs.lenses.length
                ? prefs.lenses
                : ['correctness', 'security', 'performance', 'tests'],
            constraints: activeLessons.map(l => l.text),
          };

    telemetry.reset();
    clearWorkflowSub();
    prevRunState = null;
    document.title = BASE_TITLE;
    store.set({ pending: 'starting', banner: null, selection: null });

    const r = await safe(() => window.deck.workflow.run(preset, inputs), 'workflow');
    if (!r.ok || !r.v) {
      store.set({
        pending: null,
        banner: { tone: 'fail', text: r.error || 'Failed to start workflow' },
      });
      return;
    }

    const run = r.v;
    prevRunState = run.state;
    store.set(s => ({
      ...s,
      mode: 'live',
      preset,
      goal,
      run,
      liveRunId: run.runId,
      pending: null,
    }));
    await upsertRunRecord(run, goal);
    subscribeRun(run.runId);
    telemetry.syncRun(run);
  }

  async function stopRun() {
    const st = store.get();
    if (st.mode === 'demo') {
      demo.stop();
      return;
    }
    if (!st.run || !window.deck?.workflow?.stop) return;
    store.set({ pending: 'stopping' });
    const r = await safe(() => window.deck.workflow.stop(st.run.runId), 'workflow');
    if (!r.ok) {
      store.set({ pending: null });
      showToast(r.error || 'Failed to stop');
    } else if (r.v && r.v.runId) {
      handleRunSnapshot(r.v);
    }
  }

  async function retryNode(nodeId) {
    const st = store.get();
    if (!st.run || !window.deck?.workflow?.retryNode) return;
    clearWorkflowSub();
    telemetry.reset();
    store.set({ pending: 'starting', banner: null });
    const r = await safe(() => window.deck.workflow.retryNode(st.run.runId, nodeId), 'workflow');
    if (!r.ok || !r.v) {
      store.set({ pending: null });
      showToast(r.error || 'Retry failed');
      return;
    }
    const run = r.v;
    prevRunState = run.state;
    store.set(s => ({
      ...s,
      mode: 'live',
      run,
      liveRunId: run.runId,
      pending: null,
    }));
    subscribeRun(run.runId);
    telemetry.syncRun(run);
  }

  async function rerunUnit(unitItem) {
    if (!unitItem) return;
    const st = store.get();
    const goal = st.goal || (st.run && st.run.inputs && st.run.inputs.requirement) || unitItem.title || unitItem.id;
    await startRun({ preset: 'feature-ship', goal, units: [unitItem] });
  }

  async function resumeGate(nodeId, decision, payload = {}) {
    const st = store.get();
    if (st.mode === 'demo') {
      showToast(t('demoNoRepoWrite'));
      demo.handleGateDecision(decision, payload);
      return;
    }
    if (!st.run || !window.deck?.workflow?.resumeGate) return;
    store.set({ pending: 'resuming' });
    const r = await safe(
      () => window.deck.workflow.resumeGate(st.run.runId, nodeId, decision, payload),
      'workflow',
    );
    if (!r.ok) {
      store.set({ pending: null });
      showToast(r.error || 'Gate action failed');
      return;
    }
    if (r.v && r.v.resumed === false) {
      store.set({ pending: null });
      showToast(t('gateAlreadyHandled'));
      const refreshed = await safe(() => window.deck.workflow.getRun(st.run.runId), 'workflow');
      if (refreshed.ok && refreshed.v) handleRunSnapshot(refreshed.v);
    }
  }

  async function inspectRun(runId) {
    if (store.get().mode === 'demo') demo.stop();
    if (!window.deck?.workflow?.getRun) return;
    const res = await safe(() => window.deck.workflow.getRun(runId), 'workflow');
    if (!res.ok || !res.v) {
      store.set(s => ({
        ...s,
        history: s.history.map(h => (h.runId === runId ? { ...h, expired: true } : h)),
      }));
      showToast(t('expired'));
      return;
    }
    telemetry.reset();
    const run = res.v;
    store.set(s => ({
      ...s,
      mode: 'inspect',
      preset: run.workflowId || s.preset,
      run,
      selection: null,
      banner: null,
    }));
  }

  async function backToLive() {
    const st = store.get();
    if (st.liveRunId && window.deck?.workflow?.getRun) {
      const res = await safe(() => window.deck.workflow.getRun(st.liveRunId), 'workflow');
      if (res.ok && res.v) {
        telemetry.reset();
        prevRunState = res.v.state;
        store.set(s => ({
          ...s,
          mode: 'live',
          preset: res.v.workflowId || s.preset,
          run: res.v,
          selection: null,
        }));
        if (isActiveState(res.v.state)) {
          subscribeRun(res.v.runId);
          telemetry.syncRun(res.v);
        }
        return;
      }
    }
    store.set({ mode: 'idle', run: null, selection: null });
  }

  async function selectPreset(preset) {
    const st = store.get();
    if (st.preset === preset) return;
    if (st.mode === 'demo') {
      store.set(s => ({ ...s, preset, selection: null }));
      demo.start(preset);
      return;
    }
    let banner = null;
    if (st.workflows[preset] && st.workflows[preset].error) {
      banner = { tone: 'fail', text: `${preset}: ${st.workflows[preset].error}` };
    }
    store.set(s => ({
      ...s,
      preset,
      selection: null,
      banner: st.caps.workflow === false || st.caps.db === false ? s.banner : banner,
    }));
    await savePrefs({ preset });
    checkWorkflowTopology(preset);
  }

  function openSession(sessionId) {
    if (!sessionId) return;
    if (store.get().mode === 'demo') {
      showToast(t('demoNoRepoWrite'));
      return;
    }
    if (window.deck?.agent?.open) {
      safe(() => window.deck.agent.open(sessionId), 'agent');
    } else if (window.deck?.ui?.open) {
      safe(() => window.deck.ui.open({ sessionId }), 'open');
    }
  }

  return {
    init,
    safe,
    showToast,
    savePrefs,
    startRun,
    stopRun,
    retryNode,
    rerunUnit,
    resumeGate,
    inspectRun,
    backToLive,
    selectPreset,
    openSession,
    lessons,
    demo,
  };
}
