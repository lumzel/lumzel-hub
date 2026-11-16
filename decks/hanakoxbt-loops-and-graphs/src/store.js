export const DEFAULT_PREFS = {
  preset: 'feature-ship',
  inspectorOpen: false,
  inspectorWidth: 380,
  tab: 'node',
  timelineOpen: false,
  follow: true,
  fullCheckCmd: '',
  setupCmd: 'auto',
  maxUnits: 5,
  commitFlags: '',
  reviewBase: '',
  reviewCheckCmd: '',
  lenses: ['correctness', 'security', 'performance', 'tests'],
  demoSpeed: 1,
  agentOverride: { provider: '', model: '', effort: '' },
};

export const INITIAL_STATE = {
  ctx: { theme: 'light', locale: 'zh-CN', preview: false, project: '', branch: '' },
  caps: { workflow: null, db: null, files: null, agent: null, open: null },
  mode: 'boot', // boot | idle | live | inspect | demo
  preset: 'feature-ship',
  goal: '',
  workflows: {},
  run: null,
  liveRunId: null,
  pending: null, // 'starting' | 'resuming' | 'stopping' | null
  telemetry: { rev: 0, byUnit: {}, lastSeq: 0 },
  lessons: { rev: 0, list: [] },
  fileLessons: [],
  fileSyncStatus: 'idle', // idle | synced | off
  history: [],
  selection: null, // { kind: 'node' | 'lane', id }
  prefs: { ...DEFAULT_PREFS },
  agentCatalog: null,
  agentOverride: { provider: '', model: '', effort: '' },
  ui: {
    inspectorOpen: false,
    inspectorWidth: 380,
    tab: 'node',
    timelineOpen: false,
    follow: true,
    viewport: null,
    demoFrame: 0,
    demoPaused: false,
    demoSpeed: 1,
    tick: 0,
  },
  banner: null,
  toast: null,
};

export function createStore(init = INITIAL_STATE) {
  let state = init;
  let scheduled = false;
  const subs = new Set();
  const flush = () => {
    scheduled = false;
    for (const s of subs) {
      const v = s.sel(state);
      if (!s.eq(v, s.last)) {
        s.last = v;
        s.fn(v, state);
      }
    }
  };
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      if (next === state) return;
      state = next;
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    },
    subscribe(sel, fn, eq = Object.is) {
      const s = { sel, fn, eq, last: sel(state) };
      subs.add(s);
      fn(s.last, state);
      return () => subs.delete(s);
    },
  };
}
