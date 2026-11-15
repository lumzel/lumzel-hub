import { setLocale, t } from './i18n.js';
import { DEFAULT_PREFS } from './store.js';
import { createTelemetryController, normalizeEpochSec } from './telemetry.js';
import { createLessonsController } from './lessons.js';
import { checkTopologyDrift, extractYamlNodeIds } from './topology/layout.js';
import { getTopology } from './topology/index.js';

const BASE_TITLE = 'Loops & Graphs · @hanakoxbt';
const PARAM_KEYS = ['maxUnits', 'fullCheckCmd', 'setupCmd', 'reviewCheckCmd'];

export function createHost(store, demo) {
  let workflowUnsub = null;
  let defaultsUnsub = null;
  let paramsUnsub = null;
  let pollTimer = null;
  let lastPushAt = 0;
  let pollNullCount = 0;
  let toastTimer = null;
  let tickTimer = null;
  let prevRunState = null;

  function sanitizeAgentSelection(sel, catalog) {
    const clean = {
      provider: typeof sel?.provider === 'string' ? sel.provider.trim() : '',
      model: typeof sel?.model === 'string' ? sel.model.trim() : '',
      effort: typeof sel?.effort === 'string' ? sel.effort.trim() : '',
    };
    const agents = Array.isArray(catalog?.agents) ? catalog.agents : [];
    if (agents.length === 0) return clean;
    if (clean.provider && !agents.some(a => a.id === clean.provider)) {
      return { provider: '', model: '', effort: '' };
    }
    const defaults = catalog?.defaults || {};
    const activeProvider =
      clean.provider || defaults.provider || agents.find(a => a.default)?.id || agents[0]?.id || '';
    const agent = agents.find(a => a.id === activeProvider) || agents[0];
    const models = Array.isArray(agent?.models) ? agent.models : [];
    if (clean.model && !models.some(m => m.id === clean.model)) {
      clean.model = '';
    }
    const activeModel =
      clean.model ||
      (!clean.provider && defaults.model && models.some(m => m.id === defaults.model) ? defaults.model : '') ||
      agent?.defaultModel ||
      models[0]?.id ||
      '';
    const modelObj = models.find(m => m.id === activeModel);
    const efforts = Array.isArray(modelObj?.efforts) ? modelObj.efforts : [];
    if (clean.effort && !efforts.includes(clean.effort)) {
      clean.effort = '';
    }
    return clean;
  }

  function effectiveAgentInfo(catalog = store.get().agentCatalog, selected = store.get().agentOverride) {
    const agents = Array.isArray(catalog?.agents) ? catalog.agents : [];
    const defaults = catalog?.defaults || {};
    const hostProviderId = defaults.provider || agents.find(a => a.default)?.id || agents[0]?.id || '';
    const hostAgent = agents.find(a => a.id === hostProviderId) || agents[0] || null;
    const providerId = selected?.provider || hostProviderId;
    const agent = agents.find(a => a.id === providerId) || hostAgent;
    const models = Array.isArray(agent?.models) ? agent.models : [];
    const defaultModelId =
      (!selected?.provider && defaults.model && models.some(m => m.id === defaults.model) ? defaults.model : '') ||
      agent?.defaultModel ||
      models[0]?.id ||
      '';
    const modelId = selected?.model && models.some(m => m.id === selected.model) ? selected.model : defaultModelId;
    const modelObj = models.find(m => m.id === modelId) || null;
    const efforts = Array.isArray(modelObj?.efforts) ? modelObj.efforts : [];
    const defaultEffort =
      (!selected?.provider && !selected?.model && defaults.effort && efforts.includes(defaults.effort)
        ? defaults.effort
        : '') ||
      (modelObj?.defaultEffort && efforts.includes(modelObj.defaultEffort) ? modelObj.defaultEffort : efforts[0] || '');
    const effort =
      efforts.length === 0
        ? ''
        : selected?.effort && efforts.includes(selected.effort)
          ? selected.effort
          : defaultEffort;
    const hasOverride = Boolean(selected?.provider || selected?.model || selected?.effort);
    const hasDeckDefaults = Boolean(
      defaults?.deck?.provider || defaults?.deck?.model || defaults?.deck?.effort,
    );
    return {
      agents,
      hostAgent,
      agent,
      providerId: agent?.id || providerId,
      providerName: agent?.name || providerId || 'Agent',
      models,
      modelId,
      modelName: modelObj?.name || modelId,
      defaultModelId,
      efforts,
      effort,
      defaultEffort,
      hasOverride,
      hasDeckDefaults,
    };
  }

  function workflowAgentOptions() {
    const st = store.get();
    const sel = st.agentOverride || {};
    if (!sel.provider && !sel.model && !sel.effort) return undefined;
    const info = effectiveAgentInfo(st.agentCatalog, sel);
    const opts = {};
    if (sel.provider || sel.model) opts.provider = info.providerId;
    if (sel.model) opts.model = info.modelId;
    if (sel.effort && info.efforts.includes(sel.effort)) opts.effort = sel.effort;
    return Object.keys(opts).length > 0 ? opts : undefined;
  }

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
    if (window.deck?.params?.set && !store.get().ctx.preview) {
      const paramPatch = {};
      for (const k of PARAM_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) {
          paramPatch[k] = k === 'maxUnits' ? Number(nextPrefs[k]) || 5 : String(nextPrefs[k] ?? '');
        }
      }
      if (Object.keys(paramPatch).length > 0) {
        window.deck.params.set(paramPatch).catch(() => {});
      }
    }
  }

  async function setAgentOverride(partial) {
    const st = store.get();
    const next = sanitizeAgentSelection({ ...st.agentOverride, ...partial }, st.agentCatalog);
    store.set(s => ({
      ...s,
      agentOverride: next,
      prefs: { ...s.prefs, agentOverride: next },
    }));
    if (st.mode !== 'demo' && st.caps.db !== false && window.deck?.store?.put) {
      await safe(() => window.deck.store.put('prefs', 'ui', { ...st.prefs, agentOverride: next }), 'db');
    }
  }

  async function saveAgentAsProjectDefault() {
    const st = store.get();
    if (st.ctx.preview) {
      showToast(t('demoNoRepoWrite'));
      return;
    }
    const opts = workflowAgentOptions();
    if (!opts || !window.deck?.agent?.setDefaults) return;
    const res = await safe(() => window.deck.agent.setDefaults(opts), 'agent');
    if (!res.ok) {
      showToast(res.error || 'Failed to save default');
      return;
    }
    const empty = { provider: '', model: '', effort: '' };
    store.set(s => ({
      ...s,
      agentCatalog: res.v?.defaults && s.agentCatalog ? { ...s.agentCatalog, defaults: res.v.defaults } : s.agentCatalog,
      agentOverride: empty,
      prefs: { ...s.prefs, agentOverride: empty },
    }));
    if (st.caps.db !== false && window.deck?.store?.put) {
      await safe(() => window.deck.store.put('prefs', 'ui', { ...st.prefs, agentOverride: empty }), 'db');
    }
    showToast(t('agentSavedDefault'));
  }

  async function resetAgentDefaults() {
    const st = store.get();
    const empty = { provider: '', model: '', effort: '' };
    let nextCatalog = st.agentCatalog;
    if (!st.ctx.preview && window.deck?.agent?.resetDefaults) {
      const res = await safe(() => window.deck.agent.resetDefaults(), 'agent');
      if (res.ok && res.v?.defaults && nextCatalog) {
        nextCatalog = { ...nextCatalog, defaults: res.v.defaults };
      }
    }
    store.set(s => ({
      ...s,
      agentCatalog: nextCatalog,
      agentOverride: empty,
      prefs: { ...s.prefs, agentOverride: empty },
    }));
    if (st.mode !== 'demo' && st.caps.db !== false && window.deck?.store?.put) {
      await safe(() => window.deck.store.put('prefs', 'ui', { ...st.prefs, agentOverride: empty }), 'db');
    }
  }

  function openSettings() {
    if (window.deck?.ui?.openSettings) {
      window.deck.ui.openSettings().catch(() => {});
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
    const [prefsRes, lessonsRes, runsRes, wfListRes, fileRes, catalogRes, paramsRes] = await Promise.all([
      window.deck?.store?.list ? safe(() => window.deck.store.list('prefs'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.store?.list ? safe(() => window.deck.store.list('lessons'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.store?.list ? safe(() => window.deck.store.list('runs'), 'db') : Promise.resolve({ ok: false }),
      window.deck?.workflow?.list ? safe(() => window.deck.workflow.list(), 'workflow') : Promise.resolve({ ok: false }),
      window.deck?.files?.read ? safe(() => window.deck.files.read(lessons.LESSONS_FILE), 'files') : Promise.resolve({ ok: false }),
      window.deck?.agent?.catalog ? safe(() => window.deck.agent.catalog()) : Promise.resolve({ ok: false }),
      window.deck?.params?.get ? safe(() => window.deck.params.get()) : Promise.resolve({ ok: false }),
    ]);

    // Prefs + project-scoped Deck params
    let mergedPrefs = { ...DEFAULT_PREFS };
    if (prefsRes.ok && Array.isArray(prefsRes.v)) {
      const uiEntry = prefsRes.v.find(e => e && (e.key === 'ui' || e.id === 'ui'));
      const val = uiEntry && (uiEntry.value || uiEntry);
      if (val && typeof val === 'object') {
        mergedPrefs = { ...DEFAULT_PREFS, ...val };
      }
    }
    if (paramsRes.ok && paramsRes.v?.values && typeof paramsRes.v.values === 'object') {
      for (const k of PARAM_KEYS) {
        if (paramsRes.v.values[k] !== undefined) {
          mergedPrefs[k] = paramsRes.v.values[k];
        }
      }
    }
    const agentCatalog = catalogRes.ok ? catalogRes.v || null : null;
    const agentOverride = sanitizeAgentSelection(mergedPrefs.agentOverride, agentCatalog);
    mergedPrefs.agentOverride = agentOverride;

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
      agentCatalog,
      agentOverride,
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

    if (!defaultsUnsub && typeof window.deck?.agent?.onDefaults === 'function') {
      defaultsUnsub = window.deck.agent.onDefaults(async evt => {
        const nextDefaults = evt?.defaults || {
          provider: evt?.provider || '',
          model: evt?.model || '',
          effort: evt?.effort || '',
        };
        let nextCatalog = store.get().agentCatalog;
        if (!nextCatalog && window.deck?.agent?.catalog) {
          nextCatalog = await window.deck.agent.catalog().catch(() => null);
        } else if (nextCatalog) {
          nextCatalog = { ...nextCatalog, defaults: nextDefaults };
        }
        const nextOverride = sanitizeAgentSelection(store.get().agentOverride, nextCatalog);
        store.set(s => ({
          ...s,
          agentCatalog: nextCatalog,
          agentOverride: nextOverride,
          prefs: { ...s.prefs, agentOverride: nextOverride },
        }));
      });
    }

    if (!paramsUnsub && typeof window.deck?.params?.onChange === 'function') {
      paramsUnsub = window.deck.params.onChange(evt => {
        const vals = evt?.values;
        if (!vals || typeof vals !== 'object') return;
        store.set(s => {
          const nextPrefs = { ...s.prefs };
          for (const k of PARAM_KEYS) {
            if (vals[k] !== undefined) nextPrefs[k] = vals[k];
          }
          return { ...s, prefs: nextPrefs };
        });
      });
    }

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

    const r = await safe(
      () => window.deck.workflow.run(preset, inputs, workflowAgentOptions()),
      'workflow',
    );
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
    effectiveAgentInfo,
    setAgentOverride,
    saveAgentAsProjectDefault,
    resetAgentDefaults,
    openSettings,
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
