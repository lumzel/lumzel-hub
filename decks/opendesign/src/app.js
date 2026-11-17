import { applyI18n, setLocale, t } from './i18n.js';
import { PRESET_SYSTEMS } from './presets.js';
import {
  SAMPLE_ARTIFACTS,
  SAMPLE_COMMENTS,
  SAMPLE_RUNS,
  SAMPLE_VERSIONS,
  buildStarterHtml,
} from './sample.js';
import {
  TOKEN_DEFAULTS,
  buildSrcdocHtml,
  buildStandaloneHtml,
  normalizeHex,
  parsePx,
  parseTokensCss,
  serializeTokensCss,
} from './canvasBridge.js';
import {
  focusUiSelect,
  getUiSelectValue,
  initUiSelect,
  isSelectMenuOwnedBy,
  setUiSelectOptions,
  setUiSelectValue,
} from './uiSelect.js';

const $ = id => document.getElementById(id);

const WORKFLOW_TOPOLOGIES = {
  'design-artifact': [
    { id: 'load_context', label: 'Load Context', x: 16, y: 46, next: ['propose_directions'] },
    { id: 'propose_directions', label: 'Directions', x: 132, y: 46, next: ['route_direction'] },
    { id: 'route_direction', label: 'Route', x: 248, y: 46, next: ['direction_gate', 'build_artifact'] },
    { id: 'direction_gate', label: 'Pick Gate', x: 364, y: 12, next: ['build_artifact'] },
    { id: 'build_artifact', label: 'Build HTML', x: 364, y: 80, next: ['lint_artifact'] },
    { id: 'lint_artifact', label: 'Anti-Slop Lint', x: 484, y: 80, next: ['critique_artifact'] },
    { id: 'critique_artifact', label: '5-Axis Critique', x: 604, y: 80, next: ['quality_gate'] },
    { id: 'quality_gate', label: 'Quality Gate', x: 724, y: 80, next: ['revise_from_critique', 'finalize'] },
    { id: 'revise_from_critique', label: 'Revise Fix', x: 604, y: 12, next: ['lint_artifact'] },
    { id: 'finalize', label: 'Finalize', x: 844, y: 80, next: [] },
  ],
  'extract-design-system': [
    { id: 'probe_source', label: 'Probe Source', x: 24, y: 52, next: ['author_system'] },
    { id: 'author_system', label: 'Author System', x: 170, y: 52, next: ['validate_tokens'] },
    { id: 'validate_tokens', label: 'Validate CSS', x: 316, y: 52, next: ['repair_gate'] },
    { id: 'repair_gate', label: 'Repair Gate', x: 462, y: 52, next: ['repair_system', 'finalize_system'] },
    { id: 'repair_system', label: 'Repair Tokens', x: 462, y: 12, next: ['validate_tokens'] },
    { id: 'finalize_system', label: 'Finalize', x: 610, y: 52, next: [] },
  ],
  'revise-artifact': [
    { id: 'prepare_revision', label: 'Prepare Queue', x: 24, y: 52, next: ['apply_revisions'] },
    { id: 'apply_revisions', label: 'Apply Revisions', x: 170, y: 52, next: ['lint_revision'] },
    { id: 'lint_revision', label: 'Lint HTML', x: 316, y: 52, next: ['revision_gate'] },
    { id: 'revision_gate', label: 'Lint Gate', x: 462, y: 52, next: ['fix_lint', 'finalize_revision'] },
    { id: 'fix_lint', label: 'Fix Lint', x: 462, y: 12, next: ['lint_revision'] },
    { id: 'finalize_revision', label: 'Finalize', x: 610, y: 52, next: [] },
  ],
};

const SAMPLE_AGENT_CATALOG = {
  agents: [
    {
      id: 'claude',
      name: 'Claude Code',
      default: true,
      defaultModel: 'claude-sonnet-4-5',
      models: [
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
        { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      ],
    },
    {
      id: 'codex',
      name: 'Codex',
      default: false,
      defaultModel: 'gpt-5.4',
      models: [
        { id: 'gpt-5.4', name: 'GPT-5.4', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
        { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      ],
    },
  ],
  defaults: {
    provider: 'claude',
    model: 'claude-sonnet-4-5',
    effort: 'medium',
  },
};

const state = {
  preview: false,
  theme: 'light',
  view: 'canvas', // canvas | systems | workflows
  mode: 'preview', // preview | inspect | tweaks | code
  viewport: 'desktop', // desktop | tablet | mobile | slide
  insTab: 'comments', // comments | tweaks | versions
  sysTab: 'specimen', // specimen | contract | tokens
  systems: PRESET_SYSTEMS.map(s => ({ ...s })),
  activeSystemSlug: 'editorial-slate',
  selectedSystemSlug: 'editorial-slate',
  artifacts: [],
  artifactId: '',
  comments: {}, // artifactId -> []
  versions: {}, // artifactId -> []
  activeVersion: null, // null = latest, else version number
  selectedEl: null, // { oid, tag, selector, text, styles }
  tweaks: {}, // --od-* overrides
  runs: [],
  selectedRunId: '',
  selectedNodeId: '',
  selectedNodeRunId: '',
  steeringText: '',
  lastRenderedKey: '',
  agentCatalog: null,
  selectedAgent: { provider: '', model: '', effort: '' },
  agentMenuOpen: false,
  narrowDrawer: '', // '' | 'rail' | 'inspector'
  draftAutoId: '',
  draftSystemSlug: '',
  params: { defaultSurface: 'prototype', skipDirectionGate: false, designNotes: '' },
};

let unsubWorkflow = null;
let unsubAgentDefaults = null;
let unsubParams = null;
let unsubTheme = null;
let toastTimer = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function toast(msg, isError = false) {
  const box = $('toast');
  box.textContent = msg;
  box.classList.toggle('err', isError);
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
  }, 3600);
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function shortRandomToken(len = 6) {
  const timePart = Date.now().toString(36).slice(-3);
  const randPart = Math.random().toString(36).slice(2, 2 + Math.max(2, len - 3));
  return `${timePart}${randPart}`.replace(/[^a-z0-9]/g, '').slice(0, len);
}

function ensureUniqueSlug(base, usedSet) {
  const clean = slugify(base) || `design-${shortRandomToken(6)}`;
  if (!usedSet.has(clean)) return clean;
  let n = 2;
  while (usedSet.has(`${clean}-${n}`)) n += 1;
  return `${clean}-${n}`;
}

function generateArtifactId(title = '', surface = 'prototype', avoid = '') {
  const used = new Set(state.artifacts.map(a => a.id));
  if (avoid) used.add(avoid);
  const fromTitle = slugify(title);
  if (fromTitle) return ensureUniqueSlug(fromTitle, used);
  const prefixMap = {
    prototype: 'proto',
    dashboard: 'dash',
    mobile: 'mobile',
    slides: 'slides',
    slide: 'slides',
  };
  const prefix = prefixMap[surface] || 'design';
  return ensureUniqueSlug(`${prefix}-${shortRandomToken(6)}`, used);
}

function generateSystemSlug(name = '', avoid = '') {
  const used = new Set(state.systems.map(s => s.slug));
  if (avoid) used.add(avoid);
  const fromName = slugify(name);
  if (fromName) return ensureUniqueSlug(fromName, used);
  return ensureUniqueSlug(`system-${shortRandomToken(6)}`, used);
}

function isNarrowViewport() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 980px)').matches;
}

function currentArtifact() {
  return state.artifacts.find(a => a.id === state.artifactId) || null;
}

function systemBySlug(slug) {
  return state.systems.find(s => s.slug === slug) || state.systems[0];
}

function activeSystem() {
  return systemBySlug(state.activeSystemSlug);
}

function selectedSystem() {
  return systemBySlug(state.selectedSystemSlug);
}

function surfaceLabel(surface) {
  const map = {
    prototype: t('surfacePrototype'),
    dashboard: t('surfaceDashboard'),
    mobile: t('surfaceMobile'),
    slides: t('surfaceSlides'),
  };
  return map[surface] || surface || 'Prototype';
}

function statusPillClass(st) {
  if (st === 'completed') return 'ok';
  if (st === 'waiting_gate' || st === 'limit') return 'warn';
  if (st === 'failed' || st === 'interrupted') return 'err';
  if (st === 'running') return 'brand';
  return '';
}

function statusLabel(st) {
  const map = {
    pending: t('statusPending'),
    running: t('statusRunning'),
    waiting_gate: t('statusWaiting'),
    completed: t('statusCompleted'),
    failed: t('statusFailed'),
    stopped: t('statusCanceled'),
    canceled: t('statusCanceled'),
    interrupted: t('statusInterrupted'),
    skipped: t('statusSkipped'),
  };
  return map[st] || st || '';
}

function postToCanvas(msg) {
  const frame = $('canvas-iframe');
  if (frame?.contentWindow) {
    frame.contentWindow.postMessage(msg, '*');
  }
}

function syncCanvasFrame(forceReload = false) {
  const art = currentArtifact();
  const wrap = $('stage-wrap');
  const codePane = $('code-pane');
  const empty = $('empty-canvas');
  const vpBar = $('vp-bar');
  const frame = $('canvas-iframe');

  if (!art) {
    wrap.hidden = true;
    codePane.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const displayedHtml =
    state.activeVersion != null
      ? (state.versions[art.id] || []).find(v => v.version === state.activeVersion)?.html || art.html || ''
      : art.html || '';

  if (state.mode === 'code') {
    wrap.hidden = true;
    codePane.hidden = false;
    $('code-path').textContent = art.path;
    $('code-editor').value = displayedHtml;
    return;
  }

  codePane.hidden = true;
  wrap.hidden = false;
  wrap.className = `stage-frame-wrap vp-${state.viewport}`;

  const vpDims = {
    desktop: 'Desktop · Fluid (<= 1280px)',
    tablet: '820 × 1180 · Tablet',
    mobile: '390 × 844 · Mobile',
    slide: '1280 × 720 · Slide 16:9',
  };
  vpBar.hidden = state.viewport === 'desktop';
  $('vp-dims').textContent = vpDims[state.viewport] || '';
  $('artifact-path-pill').textContent =
    state.activeVersion != null
      ? t('openInCanvas', { v: state.activeVersion })
      : art.path;

  const sys = systemBySlug(art.systemSlug || state.activeSystemSlug);
  const canUseWorktreeRoute =
    !state.preview &&
    state.activeVersion == null &&
    typeof art.path === 'string' &&
    art.path.startsWith('docs/') &&
    art.fromDisk !== false;

  const renderKey = canUseWorktreeRoute
    ? `wt:${art.id}:${art.path}:${art.updatedAt || ''}`
    : `sd:${art.id}:${state.activeVersion ?? 'latest'}:${displayedHtml.length}:${art.updatedAt || ''}`;

  if (forceReload || state.lastRenderedKey !== renderKey) {
    state.lastRenderedKey = renderKey;
    if (canUseWorktreeRoute) {
      frame.removeAttribute('srcdoc');
      frame.src = `worktree/${art.path.split('/').map(encodeURIComponent).join('/')}`;
    } else {
      frame.removeAttribute('src');
      frame.srcdoc = buildSrcdocHtml(displayedHtml, sys.tokensCss, state.tweaks);
    }
  } else {
    postToCanvas({
      type: 'od:tokens',
      tokensCss: sys.tokensCss,
      tweaks: state.tweaks,
    });
    postToCanvas({
      type: 'od:mode',
      mode: state.mode === 'inspect' ? 'inspect' : 'preview',
    });
  }
}

function sanitizeSelectedAgent(raw, catalog) {
  const clean = {
    provider: typeof raw?.provider === 'string' ? raw.provider.trim() : '',
    model: typeof raw?.model === 'string' ? raw.model.trim() : '',
    effort: typeof raw?.effort === 'string' ? raw.effort.trim() : '',
  };
  const agents = Array.isArray(catalog?.agents) ? catalog.agents : [];
  if (!agents.length) return clean;
  if (clean.provider && !agents.some(a => a.id === clean.provider)) {
    return { provider: '', model: '', effort: '' };
  }
  const activeProvider = clean.provider || catalog?.defaults?.provider || agents[0]?.id || '';
  const agent = agents.find(a => a.id === activeProvider) || agents[0];
  const models = Array.isArray(agent?.models) ? agent.models : [];
  if (clean.model && !models.some(m => m.id === clean.model)) {
    clean.model = '';
    clean.effort = '';
  }
  const activeModel = clean.model || agent?.defaultModel || catalog?.defaults?.model || models[0]?.id || '';
  const modelObj = models.find(m => m.id === activeModel);
  const efforts = Array.isArray(modelObj?.efforts) ? modelObj.efforts : [];
  if (clean.effort && !efforts.includes(clean.effort)) {
    clean.effort = '';
  }
  return clean;
}

function effectiveAgentInfo(catalog = state.agentCatalog, selected = state.selectedAgent) {
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
    (!selected?.provider && !selected?.model && defaults.effort && efforts.includes(defaults.effort) ? defaults.effort : '') ||
    (modelObj?.defaultEffort && efforts.includes(modelObj.defaultEffort) ? modelObj.defaultEffort : efforts[0] || '');
  const effort =
    efforts.length === 0
      ? ''
      : selected?.effort && efforts.includes(selected.effort)
        ? selected.effort
        : defaultEffort;
  const hasOverride = Boolean(selected?.provider || selected?.model || selected?.effort);
  return {
    agents,
    hostAgent,
    agent,
    providerId: agent?.id || providerId,
    providerName: agent?.name || providerId || 'Agent',
    models,
    modelObj,
    modelId,
    modelName: modelObj?.name || modelId,
    defaultModelId,
    efforts,
    effort,
    defaultEffort,
    hasOverride,
  };
}

function populateAgentSelectTriplet(agentSel, modelSel, effortSel, effortRow, info) {
  if (!agentSel || !modelSel || !effortSel) return;
  const selected = state.selectedAgent;
  const hostName = info.hostAgent?.name || info.hostAgent?.id || 'Default';
  const nextAgent = selected.provider && info.agents.some(a => a.id === selected.provider) ? selected.provider : '';
  setUiSelectOptions(
    agentSel,
    [
      { value: '', label: t('agentFollowHost', { name: hostName }), muted: true },
      ...info.agents.map(a => ({ value: a.id, label: a.name || a.id })),
    ],
    nextAgent,
  );

  const defModelObj = info.models.find(m => m.id === info.defaultModelId);
  const defModelLabel = defModelObj?.name || info.defaultModelId || '—';
  const nextModel = selected.model && info.models.some(m => m.id === selected.model) ? selected.model : '';
  setUiSelectOptions(
    modelSel,
    [
      { value: '', label: t('agentFollowDefaultModel', { name: defModelLabel }), muted: true },
      ...info.models.map(m => ({ value: m.id, label: m.name || m.id })),
    ],
    nextModel,
  );

  if (effortRow) effortRow.hidden = info.efforts.length === 0;
  if (info.efforts.length > 0) {
    const nextEffort = selected.effort && info.efforts.includes(selected.effort) ? selected.effort : '';
    setUiSelectOptions(
      effortSel,
      [
        { value: '', label: t('agentFollowDefaultEffort', { effort: info.defaultEffort || info.efforts[0] }), muted: true },
        ...info.efforts.map(e => ({ value: e, label: e })),
      ],
      nextEffort,
    );
  } else {
    setUiSelectOptions(effortSel, [], '');
  }
}

function renderStaticSelects() {
  const surfaceSel = $('new-surface');
  if (surfaceSel) {
    const cur = getUiSelectValue(surfaceSel) || 'prototype';
    setUiSelectOptions(
      surfaceSel,
      [
        { value: 'prototype', label: t('surfacePrototype') },
        { value: 'dashboard', label: t('surfaceDashboard') },
        { value: 'mobile', label: t('surfaceMobile') },
        { value: 'slides', label: t('surfaceSlides') },
      ],
      cur,
    );
  }

  const sourceSel = $('ext-source-kind');
  if (sourceSel) {
    const cur = getUiSelectValue(sourceSel) || 'codebase';
    setUiSelectOptions(
      sourceSel,
      [
        { value: 'codebase', label: t('sourceCodebase') },
        { value: 'url', label: t('sourceUrl') },
        { value: 'brief', label: t('sourceBrief') },
      ],
      cur,
    );
  }
}

function syncNarrowDrawers() {
  if (!isNarrowViewport() && state.narrowDrawer) {
    state.narrowDrawer = '';
  }
  const canvasPane = $('view-canvas');
  const railOpen = state.narrowDrawer === 'rail';
  const insOpen = state.narrowDrawer === 'inspector';
  if (canvasPane) {
    canvasPane.dataset.drawer = state.narrowDrawer || '';
  }
  const scrim = $('drawer-scrim');
  if (scrim) scrim.hidden = !railOpen && !insOpen;
  $('btn-toggle-rail')?.setAttribute('aria-expanded', railOpen ? 'true' : 'false');
  $('btn-toggle-inspector')?.setAttribute('aria-expanded', insOpen ? 'true' : 'false');
}

function renderAgentControls() {
  const wrap = $('agent-override-wrap');
  const info = effectiveAgentInfo();
  const hasAgents = info.agents.length > 0;
  if (wrap) wrap.hidden = !hasAgents;
  for (const fieldId of ['new-agent', 'ext-agent']) {
    const grid = $(fieldId)?.closest('.modal-agent-grid');
    if (grid) grid.hidden = !hasAgents;
  }
  const reviseChip = $('revise-agent-chip');
  if (reviseChip) reviseChip.hidden = !hasAgents;
  if (!hasAgents) return;

  const summary = [info.providerName, info.modelName || info.modelId, info.effort].filter(Boolean).join(' · ');
  const pill = $('agent-override-pill');
  if (pill) {
    pill.classList.toggle('active', info.hasOverride);
    pill.setAttribute('aria-expanded', state.agentMenuOpen ? 'true' : 'false');
    pill.title = summary;
  }
  if ($('agent-override-label')) $('agent-override-label').textContent = summary;
  if ($('revise-agent-val')) $('revise-agent-val').textContent = summary;

  const hasDeckDefaults = Boolean(
    state.agentCatalog?.defaults?.deck?.provider ||
    state.agentCatalog?.defaults?.deck?.model ||
    state.agentCatalog?.defaults?.deck?.effort,
  );
  const pop = $('agent-popover');
  if (pop) pop.hidden = !state.agentMenuOpen;
  const badge = $('od-agent-badge');
  if (badge) {
    badge.textContent = info.hasOverride ? t('agentBadgeCustom') : t('agentBadgeHost');
    badge.className = `pill${info.hasOverride ? ' brand' : ''}`;
  }
  if ($('od-agent-reset')) $('od-agent-reset').hidden = !info.hasOverride && !hasDeckDefaults;
  if ($('od-agent-save-default')) {
    $('od-agent-save-default').hidden = state.preview || !info.hasOverride;
  }
  if ($('od-agent-hint')) $('od-agent-hint').textContent = info.hasOverride ? t('agentHintCustom') : t('agentHintHost');

  populateAgentSelectTriplet($('od-agent-select'), $('od-model-select'), $('od-effort-select'), $('od-effort-row'), info);
  populateAgentSelectTriplet($('new-agent'), $('new-model'), $('new-effort'), $('new-effort-field'), info);
  populateAgentSelectTriplet($('ext-agent'), $('ext-model'), $('ext-effort'), $('ext-effort-field'), info);
}

async function setAgentOverride(partial) {
  const next = sanitizeSelectedAgent({ ...state.selectedAgent, ...partial }, state.agentCatalog);
  state.selectedAgent = next;
  renderAgentControls();
  if (!state.preview) {
    await saveStore('meta', 'agentOverride', next);
  }
}

async function saveAgentAsProjectDefault() {
  if (state.preview) return toast(t('previewDisabled'), true);
  const opts = workflowAgentOptions();
  if (!opts || typeof window.deck?.agent?.setDefaults !== 'function') return;
  const res = await window.deck.agent.setDefaults(opts).catch(err => {
    toast(err?.message || String(err), true);
    return null;
  });
  if (!res) return;
  if (state.agentCatalog && res.defaults) {
    state.agentCatalog = { ...state.agentCatalog, defaults: res.defaults };
  }
  state.selectedAgent = { provider: '', model: '', effort: '' };
  await saveStore('meta', 'agentOverride', state.selectedAgent);
  renderAgentControls();
  toast(t('agentSavedDefault'));
}

async function resetAgentDefaults() {
  state.selectedAgent = { provider: '', model: '', effort: '' };
  if (!state.preview) {
    await saveStore('meta', 'agentOverride', state.selectedAgent);
    if (typeof window.deck?.agent?.resetDefaults === 'function') {
      const res = await window.deck.agent.resetDefaults().catch(() => null);
      if (state.agentCatalog && res?.defaults) {
        state.agentCatalog = { ...state.agentCatalog, defaults: res.defaults };
      }
    }
  }
  renderAgentControls();
}

function workflowAgentOptions() {
  const selected = state.selectedAgent;
  if (!selected.provider && !selected.model && !selected.effort) return undefined;
  const info = effectiveAgentInfo();
  const opts = {};
  if (selected.provider || selected.model) opts.provider = info.providerId;
  if (selected.model) opts.model = info.modelId;
  if (selected.effort && info.efforts.includes(selected.effort)) opts.effort = selected.effort;
  return Object.keys(opts).length > 0 ? opts : undefined;
}

function renderTopbar() {
  const sys = activeSystem();
  $('active-sys-name').textContent = sys.name;
  const parsed = parseTokensCss(sys.tokensCss);
  $('active-sys-swatch').style.background = parsed['--od-accent'] || '#0070e3';
  renderAgentControls();

  for (const btn of document.querySelectorAll('.main-tab')) {
    btn.classList.toggle('on', btn.dataset.view === state.view);
  }
  const hasActiveRun = state.runs.some(r => r.state === 'running' || r.state === 'waiting_gate');
  $('wf-badge').hidden = !hasActiveRun;

  $('view-canvas').hidden = state.view !== 'canvas';
  $('view-systems').hidden = state.view !== 'systems';
  $('view-workflows').hidden = state.view !== 'workflows';
  if (state.view !== 'canvas' && state.narrowDrawer) {
    state.narrowDrawer = '';
  }
  syncNarrowDrawers();
}

function renderArtifactRail() {
  const countText = String(state.artifacts.length);
  $('artifact-count').textContent = countText;
  if ($('toolbar-artifact-count')) $('toolbar-artifact-count').textContent = countText;
  const list = $('artifact-list');
  if (!state.artifacts.length) {
    list.replaceChildren(el('p', { class: 'hint-sm', style: 'padding:8px 4px;' }, t('emptyArtifacts')));
    return;
  }
  list.replaceChildren(
    ...state.artifacts.map(art =>
      el(
        'button',
        {
          type: 'button',
          class: `rail-item${art.id === state.artifactId ? ' on' : ''}`,
          onclick: () => {
            state.artifactId = art.id;
            state.activeVersion = null;
            state.selectedEl = null;
            state.lastRenderedKey = '';
            if (isNarrowViewport()) state.narrowDrawer = '';
            renderAll();
          },
        },
        el('b', {}, art.title || art.id),
        el(
          'div',
          { class: 'rail-meta' },
          el('span', { class: 'pill' }, surfaceLabel(art.surface)),
          el(
            'span',
            { class: 'mono' },
            `${art.version ? `v${art.version}` : 'v1'}${art.critique?.score ? ` · ${art.critique.score}` : ''}`,
          ),
        ),
      ),
    ),
  );
}

function renderInspector() {
  const art = currentArtifact();
  for (const tab of document.querySelectorAll('.ins-tab')) {
    tab.classList.toggle('on', tab.dataset.instab === state.insTab);
  }
  $('ins-comments').hidden = state.insTab !== 'comments';
  $('ins-tweaks').hidden = state.insTab !== 'tweaks';
  $('ins-versions').hidden = state.insTab !== 'versions';

  const comments = art ? state.comments[art.id] || [] : [];
  const commentCountText = String(comments.length);
  $('comment-count').textContent = commentCountText;
  if ($('toolbar-comment-count')) $('toolbar-comment-count').textContent = commentCountText;

  const selVal = $('selected-val');
  if (state.selectedEl) {
    selVal.replaceChildren(
      state.selectedEl.oid ? el('span', { class: 'oid-chip' }, state.selectedEl.oid) : null,
      el('span', { class: 'mono' }, `<${state.selectedEl.tag}>`),
      state.selectedEl.text ? ` — ${state.selectedEl.text.slice(0, 64)}` : '',
    );
  } else {
    selVal.textContent = t('noSelection');
  }

  const cList = $('comment-list');
  if (!comments.length) {
    cList.replaceChildren(el('p', { class: 'hint-sm' }, t('noComments')));
  } else {
    cList.replaceChildren(
      ...comments.map(c =>
        el(
          'div',
          {
            class: 'comment-card',
            onclick: () => {
              if (c.oid) postToCanvas({ type: 'od:highlight', oid: c.oid });
            },
          },
          el(
            'div',
            { class: 'row-between' },
            el('span', { class: 'oid-chip' }, c.oid || c.selector || 'canvas'),
            el(
              'button',
              {
                type: 'button',
                class: 'link-btn',
                onclick: e => {
                  e.stopPropagation();
                  removeComment(art.id, c.id);
                },
              },
              '×',
            ),
          ),
          el('p', {}, c.note),
        ),
      ),
    );
  }

  const critCard = $('critique-card');
  if (art?.critique) {
    critCard.hidden = false;
    const axes = art.critique.axes || {};
    critCard.replaceChildren(
      el(
        'div',
        { class: 'row-between' },
        el('strong', { style: 'font-size:11.5px;' }, t('critiqueCardTitle')),
        el('span', { class: `pill ${art.critique.score >= 78 ? 'ok' : 'warn'}` }, `${art.critique.score}/100`),
      ),
      art.critique.summary ? el('div', { class: 'hint-sm' }, art.critique.summary) : null,
      Object.keys(axes).length
        ? el(
            'div',
            { class: 'axes-grid' },
            ...Object.entries(axes).map(([k, v]) =>
              el('div', { class: 'axis-row' }, el('span', {}, k), el('b', {}, String(v))),
            ),
          )
        : null,
      art.lint
        ? el(
            'div',
            { class: `pill ${art.lint.ok ? 'ok' : 'warn'}`, style: 'align-self:flex-start;' },
            art.lint.ok ? t('lintOk') : t('lintIssues', { n: (art.lint.issues || []).length }),
          )
        : null,
    );
  } else {
    critCard.hidden = true;
  }

  renderTweaksTab();
  renderVersionsTab(art);
}

function renderTweaksTab() {
  const sys = systemBySlug(currentArtifact()?.systemSlug || state.activeSystemSlug);
  const baseVars = parseTokensCss(sys.tokensCss);
  const eff = { ...baseVars, ...state.tweaks };

  const colorFields = [
    ['--od-bg', t('tweakBg')],
    ['--od-surface', t('tweakSurface')],
    ['--od-fg', t('tweakFg')],
    ['--od-accent', t('tweakAccent')],
    ['--od-border', t('tweakBorder')],
  ];

  $('tweak-colors').replaceChildren(
    ...colorFields.map(([prop, label]) => {
      const hex = normalizeHex(eff[prop], TOKEN_DEFAULTS[prop] || '#0070e3');
      const colorInp = el('input', {
        type: 'color',
        value: hex,
        oninput: e => updateTweak(prop, e.target.value),
      });
      const textInp = el('input', {
        type: 'text',
        value: eff[prop] || hex,
        onchange: e => updateTweak(prop, e.target.value),
      });
      return el(
        'div',
        { class: 'tweak-row' },
        el('div', { class: 'tweak-top' }, el('span', {}, label), el('span', { class: 'mono' }, prop)),
        el('div', { class: 'color-pair' }, colorInp, textInp),
      );
    }),
  );

  const radiusNum = parsePx(eff['--od-radius'], 8);
  const spaceNum = parsePx(eff['--od-space'], 16);
  const scaleNum = parseFloat(eff['--od-font-scale'] || '1') || 1;

  $('tweak-sliders').replaceChildren(
    el(
      'div',
      { class: 'tweak-row' },
      el('div', { class: 'tweak-top' }, el('span', {}, t('tweakRadius')), el('span', { class: 'mono' }, `${radiusNum}px`)),
      el('input', {
        type: 'range',
        min: 0,
        max: 20,
        step: 1,
        value: radiusNum,
        oninput: e => updateTweak('--od-radius', `${e.target.value}px`),
      }),
    ),
    el(
      'div',
      { class: 'tweak-row' },
      el('div', { class: 'tweak-top' }, el('span', {}, t('tweakSpace')), el('span', { class: 'mono' }, `${spaceNum}px`)),
      el('input', {
        type: 'range',
        min: 10,
        max: 24,
        step: 1,
        value: spaceNum,
        oninput: e => updateTweak('--od-space', `${e.target.value}px`),
      }),
    ),
    el(
      'div',
      { class: 'tweak-row' },
      el('div', { class: 'tweak-top' }, el('span', {}, t('tweakFontScale')), el('span', { class: 'mono' }, `${scaleNum.toFixed(2)}x`)),
      el('input', {
        type: 'range',
        min: 0.85,
        max: 1.25,
        step: 0.05,
        value: scaleNum,
        oninput: e => updateTweak('--od-font-scale', String(e.target.value)),
      }),
    ),
  );
}

function updateTweak(prop, value) {
  state.tweaks = { ...state.tweaks, [prop]: value };
  postToCanvas({ type: 'od:tweak', tweaks: state.tweaks });
  renderTweaksTab();
}

function renderVersionsTab(art) {
  const list = $('version-list');
  const vers = art ? state.versions[art.id] || [] : [];
  if (!vers.length) {
    list.replaceChildren(el('p', { class: 'hint-sm' }, t('versionsEmpty')));
    return;
  }
  list.replaceChildren(
    ...vers.map(v => {
      const isCurrent = state.activeVersion == null ? v.version === vers[0].version : state.activeVersion === v.version;
      return el(
        'div',
        { class: `version-card${isCurrent ? ' on' : ''}` },
        el(
          'div',
          {},
          el('b', { style: 'font-size:12px;display:block;' }, v.label || `v${v.version}`),
          el('small', { class: 'hint-sm mono' }, v.createdAt || ''),
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'btn sm',
            onclick: () => {
              state.activeVersion = v.version === vers[0].version ? null : v.version;
              state.lastRenderedKey = '';
              renderAll();
            },
          },
          t('restoreVersion'),
        ),
      );
    }),
  );
}

function renderSystemsView() {
  const sysList = $('system-list');
  sysList.replaceChildren(
    ...state.systems.map(sys =>
      el(
        'button',
        {
          type: 'button',
          class: `rail-item${sys.slug === state.selectedSystemSlug ? ' on' : ''}`,
          onclick: () => {
            state.selectedSystemSlug = sys.slug;
            renderSystemsView();
          },
        },
        el(
          'div',
          { class: 'row-between' },
          el('b', {}, sys.name),
          sys.slug === state.activeSystemSlug ? el('span', { class: 'pill ok' }, t('systemActivePill')) : null,
        ),
        el(
          'div',
          { class: 'rail-meta' },
          el(
            'div',
            { class: 'swatch-strip' },
            ...(sys.swatches || []).slice(0, 5).map(hex => el('span', { class: 'swatch-dot', style: `background:${hex}` })),
          ),
          el('span', { class: 'mono' }, sys.slug),
        ),
      ),
    ),
  );

  const sys = selectedSystem();
  $('sys-title').textContent = sys.name;
  $('sys-slug').textContent = sys.slug;
  $('sys-tagline').textContent = sys.tagline || '';
  const isActive = sys.slug === state.activeSystemSlug;
  $('sys-active-pill').hidden = !isActive;
  $('btn-activate-system').hidden = isActive;

  for (const tab of document.querySelectorAll('.subtab')) {
    tab.classList.toggle('on', tab.dataset.systab === state.sysTab);
  }
  $('sys-specimen').hidden = state.sysTab !== 'specimen';
  $('sys-contract').hidden = state.sysTab !== 'contract';
  $('sys-tokens').hidden = state.sysTab !== 'tokens';

  $('sys-md-pre').textContent = sys.designMd || '';
  $('sys-tokens-editor').value = sys.tokensCss || '';

  const vars = parseTokensCss(sys.tokensCss);
  const inlineVars = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

  $('sys-specimen').replaceChildren(
    el(
      'div',
      { class: 'specimen-canvas', style: inlineVars },
      el(
        'div',
        { class: 'row-between' },
        el('div', {}, el('strong', { style: 'font-size:15px;' }, t('specimenTitle')), el('div', { style: 'color:var(--od-muted);font-size:12px;' }, t('specimenSub'))),
        el('span', { class: 'pill', style: 'background:var(--od-surface);border:1px solid var(--od-border);color:var(--od-accent);' }, t('specimenBadge')),
      ),
      el(
        'div',
        { class: 'spec-grid' },
        el(
          'div',
          { class: 'spec-card', style: 'display:flex;flex-direction:column;gap:10px;' },
          el('h3', { style: 'margin:0;font-size:19px;letter-spacing:-0.02em;' }, t('specimenHeadline')),
          el('p', { style: 'margin:0;color:var(--od-muted);font-size:12.5px;' }, t('specimenCopy')),
          el(
            'div',
            { style: 'display:flex;gap:8px;margin-top:4px;' },
            el('button', { type: 'button', style: 'padding:7px 14px;border-radius:calc(var(--od-radius) - 2px);background:var(--od-accent);color:var(--od-accent-fg);font-weight:600;font-size:12px;' }, t('specimenPrimaryBtn')),
            el('button', { type: 'button', style: 'padding:7px 14px;border-radius:calc(var(--od-radius) - 2px);background:var(--od-surface-2);color:var(--od-fg);border:1px solid var(--od-border);font-size:12px;' }, t('specimenSecondaryBtn')),
          ),
        ),
        el(
          'div',
          { class: 'spec-card', style: 'display:flex;flex-direction:column;justify-content:space-between;gap:12px;' },
          el(
            'div',
            {},
            el('div', { style: 'color:var(--od-muted);font-size:11.5px;' }, t('specimenKpiLabel')),
            el('div', { style: 'font-family:var(--od-font-mono);font-size:26px;font-weight:700;margin-top:4px;' }, t('specimenKpiValue')),
          ),
          el('input', {
            type: 'text',
            placeholder: t('specimenInputPh'),
            style: 'width:100%;padding:7px 10px;border-radius:calc(var(--od-radius) - 2px);border:1px solid var(--od-border);background:var(--od-bg);color:var(--od-fg);font-size:12px;',
          }),
        ),
      ),
      el(
        'div',
        { class: 'spec-card spec-swatches' },
        ...[
          ['--od-bg', vars['--od-bg']],
          ['--od-surface', vars['--od-surface']],
          ['--od-fg', vars['--od-fg']],
          ['--od-accent', vars['--od-accent']],
          ['--od-border', vars['--od-border']],
        ].map(([name, hex]) =>
          el(
            'div',
            { style: 'display:flex;flex-direction:column;gap:4px;' },
            el('div', { style: `height:28px;border-radius:6px;background:${hex};border:1px solid var(--od-border);` }),
            el('span', { class: 'mono', style: 'font-size:10.5px;color:var(--od-muted);' }, name),
            el('span', { class: 'mono', style: 'font-size:11px;' }, hex),
          ),
        ),
      ),
    ),
  );
}

function resolveActiveNodeId(run, topo) {
  const validIds = new Set(topo.map(n => n.id));
  if (state.selectedNodeRunId === run.runId && state.selectedNodeId && validIds.has(state.selectedNodeId)) {
    return state.selectedNodeId;
  }
  if (run.pausedGate?.nodeId && validIds.has(run.pausedGate.nodeId)) {
    return run.pausedGate.nodeId;
  }
  const nodes = run.nodes || [];
  if (Array.isArray(run.currentNodes)) {
    const cur = run.currentNodes.find(id => validIds.has(id));
    if (cur) return cur;
  }
  const running = nodes.find(n => n.state === 'running' && validIds.has(n.nodeId));
  if (running) return running.nodeId;
  const errored = nodes.find(n => (n.state === 'failed' || n.state === 'interrupted') && validIds.has(n.nodeId));
  if (errored) return errored.nodeId;

  let latestCompleted = null;
  for (const n of nodes) {
    if (n.state === 'completed' && validIds.has(n.nodeId)) {
      if (!latestCompleted || (n.finishedAt || 0) >= (latestCompleted.finishedAt || 0)) {
        latestCompleted = n;
      }
    }
  }
  if (latestCompleted) return latestCompleted.nodeId;

  for (let i = topo.length - 1; i >= 0; i -= 1) {
    if (run.outputs && Object.prototype.hasOwnProperty.call(run.outputs, topo[i].id)) {
      return topo[i].id;
    }
  }
  return topo[0]?.id || '';
}

function renderWorkflowsView() {
  const runList = $('run-list');
  if (!state.runs.length) {
    runList.replaceChildren(el('p', { class: 'hint-sm', style: 'padding:6px 4px;' }, t('noRunsYet')));
    $('wf-empty').hidden = false;
    $('wf-detail').hidden = true;
    return;
  }

  runList.replaceChildren(
    ...state.runs.map(r =>
      el(
        'button',
        {
          type: 'button',
          class: `rail-item${r.runId === state.selectedRunId ? ' on' : ''}`,
          onclick: () => {
            state.selectedRunId = r.runId;
            state.selectedNodeId = '';
            state.selectedNodeRunId = r.runId;
            renderWorkflowsView();
          },
        },
        el('b', {}, r.inputs?.title || r.workflowId),
        el(
          'div',
          { class: 'rail-meta' },
          el('span', { class: 'mono' }, r.workflowId),
          el('span', { class: `pill ${statusPillClass(r.state)}` }, statusLabel(r.state)),
        ),
      ),
    ),
  );

  const run = state.runs.find(r => r.runId === state.selectedRunId) || state.runs[0];
  if (state.selectedNodeRunId !== run.runId) {
    state.selectedNodeId = '';
    state.selectedNodeRunId = run.runId;
  }
  state.selectedRunId = run.runId;
  $('wf-empty').hidden = true;
  $('wf-detail').hidden = false;
  $('wf-run-title').textContent = run.inputs?.title || run.workflowId;
  $('wf-run-id').textContent = run.runId;
  const stPill = $('wf-run-status');
  stPill.textContent = statusLabel(run.state);
  stPill.className = `pill ${statusPillClass(run.state)}`;
  const subParts = [run.workflowId, run.inputs?.systemSlug || ''];
  if (typeof run.round === 'number' && run.round > 0) subParts.push(t('roundLabel', { n: run.round }));
  $('wf-run-sub').textContent = subParts.filter(Boolean).join(' · ');
  $('btn-wf-stop').hidden = !(run.state === 'running' || run.state === 'waiting_gate');

  renderWorkflowGraph(run);
  renderDirectionPicker(run);
  renderNodeDetail(run);
}

function renderWorkflowGraph(run) {
  const topo = WORKFLOW_TOPOLOGIES[run.workflowId] || WORKFLOW_TOPOLOGIES['design-artifact'];
  const nodeStates = new Map((run.nodes || []).map(n => [n.nodeId, n]));
  const activeNodeId = resolveActiveNodeId(run, topo);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'wf-svg');
  svg.setAttribute('viewBox', '0 0 960 132');

  const nodeW = 98;
  const nodeH = 38;
  const byId = new Map(topo.map(n => [n.id, n]));
  const stateOf = id => nodeStates.get(id)?.state || (run.pausedGate?.nodeId === id ? 'waiting_gate' : 'pending');

  for (const n of topo) {
    const srcState = stateOf(n.id);
    for (const targetId of n.next) {
      const target = byId.get(targetId);
      if (!target) continue;
      const dstState = stateOf(targetId);
      const isActiveEdge =
        srcState === 'completed' &&
        (dstState === 'completed' || dstState === 'running' || dstState === 'waiting_gate');
      const line = document.createElementNS(ns, 'path');
      const x1 = n.x + nodeW;
      const y1 = n.y + nodeH / 2;
      const x2 = target.x;
      const y2 = target.y + nodeH / 2;
      const d =
        x2 < x1
          ? `M ${n.x + nodeW / 2} ${n.y} C ${n.x} ${n.y - 18}, ${target.x + nodeW} ${target.y - 18}, ${target.x + nodeW / 2} ${target.y}`
          : `M ${x1} ${y1} L ${x2} ${y2}`;
      line.setAttribute('d', d);
      line.setAttribute('fill', 'none');
      line.setAttribute(
        'stroke',
        dstState === 'running' || dstState === 'waiting_gate'
          ? 'var(--brand)'
          : isActiveEdge
            ? 'var(--ok)'
            : 'var(--border-strong)',
      );
      line.setAttribute('stroke-width', isActiveEdge ? '1.8' : '1.35');
      if (!isActiveEdge && dstState === 'pending') line.setAttribute('stroke-dasharray', '3 3');
      svg.appendChild(line);
    }
  }

  for (const n of topo) {
    const st = stateOf(n.id);
    const selected = activeNodeId === n.id;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'wf-node-g');
    g.setAttribute('data-state', st);
    if (selected) g.setAttribute('data-selected', 'true');
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => {
      state.selectedNodeId = n.id;
      state.selectedNodeRunId = run.runId;
      renderWorkflowGraph(run);
      renderNodeDetail(run);
    });

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(n.x));
    rect.setAttribute('y', String(n.y));
    rect.setAttribute('width', String(nodeW));
    rect.setAttribute('height', String(nodeH));
    rect.setAttribute('rx', '7');
    rect.setAttribute('class', 'wf-node-rect');
    rect.setAttribute(
      'fill',
      st === 'waiting_gate' || st === 'running' ? 'var(--brand-soft)' : selected ? 'var(--surface)' : 'var(--canvas)',
    );
    rect.setAttribute(
      'stroke',
      selected
        ? 'var(--brand)'
        : st === 'completed'
          ? 'var(--ok)'
          : st === 'failed' || st === 'interrupted'
            ? 'var(--err)'
            : st === 'waiting_gate' || st === 'running'
              ? 'var(--brand)'
              : 'var(--border-strong)',
    );
    if (selected) rect.setAttribute('stroke-width', '2.2');
    g.appendChild(rect);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(n.x + nodeW / 2));
    text.setAttribute('y', String(n.y + 17));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--fg)');
    text.setAttribute('font-size', '10.5');
    text.setAttribute('font-weight', '600');
    text.textContent = n.label;
    g.appendChild(text);

    const sub = document.createElementNS(ns, 'text');
    sub.setAttribute('x', String(n.x + nodeW / 2));
    sub.setAttribute('y', String(n.y + 30));
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute(
      'fill',
      st === 'completed'
        ? 'var(--ok)'
        : st === 'failed' || st === 'interrupted'
          ? 'var(--err)'
          : st === 'running' || st === 'waiting_gate'
            ? 'var(--brand)'
            : 'var(--muted)',
    );
    sub.setAttribute('font-size', '9');
    sub.textContent = statusLabel(st);
    g.appendChild(sub);

    svg.appendChild(g);
  }

  $('wf-graph-card').replaceChildren(svg);
}

function renderDirectionPicker(run) {
  const picker = $('direction-picker');
  const proposed = run.outputs?.propose_directions;
  const isWaiting = run.state === 'waiting_gate' && run.pausedGate?.nodeId === 'direction_gate';
  if (!isWaiting || !proposed?.directions?.length) {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;
  const steeringInput = el('input', {
    type: 'text',
    value: state.steeringText,
    placeholder: t('steeringPh'),
    oninput: e => {
      state.steeringText = e.target.value;
    },
  });

  picker.replaceChildren(
    el('div', { class: 'row-between' }, el('strong', {}, t('directionPickerTitle')), el('span', { class: 'pill warn' }, t('statusWaiting'))),
    el('p', { class: 'muted-line' }, t('directionPickerSub')),
    proposed.assumptions?.length
      ? el(
          'ul',
          { style: 'margin:0;padding-left:18px;font-size:12px;color:var(--muted);' },
          ...proposed.assumptions.map(a => el('li', {}, a)),
        )
      : null,
    el(
      'div',
      { class: 'dir-grid' },
      ...proposed.directions.map(dir =>
        el(
          'div',
          { class: 'dir-card' },
          el('h4', {}, dir.name),
          el('p', {}, dir.rationale),
          el('div', { class: 'hint-sm mono' }, dir.palette),
          el('div', { class: 'hint-sm' }, dir.layoutIdea),
          el(
            'button',
            {
              type: 'button',
              class: 'btn primary sm',
              onclick: () => resumeDirectionGate(run, dir),
            },
            t('chooseDirection'),
          ),
        ),
      ),
    ),
    el('label', { class: 'field-sm' }, el('span', {}, t('steeringLabel')), steeringInput),
  );
}

function renderJsonLeaf(val) {
  if (val === null) return el('span', { class: 'wf-jt-null' }, 'null');
  if (typeof val === 'boolean') return el('span', { class: 'wf-jt-bool' }, String(val));
  if (typeof val === 'number') return el('span', { class: 'wf-jt-num' }, String(val));
  if (typeof val === 'string') {
    if (val.length <= 200) return el('span', { class: 'wf-jt-str' }, JSON.stringify(val));
    let expanded = false;
    const span = el('span', { class: 'wf-jt-str' }, `"${val.slice(0, 180).replace(/\s+/g, ' ')}…"`);
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'wf-jt-more',
        onclick: () => {
          expanded = !expanded;
          span.textContent = expanded ? val : `"${val.slice(0, 180).replace(/\s+/g, ' ')}…"`;
          span.classList.toggle('expanded', expanded);
          btn.textContent = expanded ? t('collapseAll') : t('expandAll');
        },
      },
      t('expandAll'),
    );
    return el('span', {}, span, btn);
  }
  return el('span', { class: 'wf-jt-null' }, String(val));
}

function renderJsonNodeEl(value, { keyName = undefined, depth = 0, defaultDepth = 2, maxEntries = 200 } = {}) {
  const keyPrefix =
    keyName !== undefined
      ? [el('span', { class: typeof keyName === 'number' ? 'wf-jt-idx' : 'wf-jt-key' }, typeof keyName === 'number' ? `[${keyName}]` : keyName), el('span', { class: 'wf-jt-punct' }, ': ')]
      : [];

  if (value === null || typeof value !== 'object') {
    return el('div', { class: 'wf-jt-row' }, ...keyPrefix, renderJsonLeaf(value));
  }

  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  if (!entries.length) {
    return el('div', { class: 'wf-jt-row' }, ...keyPrefix, el('span', { class: 'wf-jt-punct' }, isArr ? '[]' : '{}'));
  }

  const details = el('details', { class: 'wf-jt-branch', open: depth < defaultDepth });
  const badge = isArr ? `[${t('jsonItemsTag', { n: entries.length })}]` : `{${t('jsonKeysTag', { n: entries.length })}}`;
  details.append(el('summary', { class: 'wf-jt-sum' }, ...keyPrefix, el('span', { class: 'wf-jt-badge' }, badge)));

  const childrenBox = el('div', { class: 'wf-jt-children' });
  const shown = entries.slice(0, maxEntries);
  for (const [k, v] of shown) {
    childrenBox.append(renderJsonNodeEl(v, { keyName: k, depth: depth + 1, defaultDepth, maxEntries }));
  }
  if (entries.length > maxEntries) {
    const moreBtn = el(
      'button',
      {
        type: 'button',
        class: 'wf-jt-more',
        onclick: () => {
          moreBtn.remove();
          for (const [k, v] of entries.slice(maxEntries)) {
            childrenBox.append(renderJsonNodeEl(v, { keyName: k, depth: depth + 1, defaultDepth, maxEntries }));
          }
        },
      },
      t('showAllItems', { n: entries.length - maxEntries }),
    );
    childrenBox.append(moreBtn);
  }
  details.append(childrenBox);
  return details;
}

function renderNodeStructuredView(run, nodeId, out) {
  if (!out || typeof out !== 'object') return null;

  if (nodeId === 'propose_directions' && Array.isArray(out.directions)) {
    return el(
      'div',
      { class: 'wf-node-structured' },
      out.assumptions?.length
        ? el(
            'div',
            { class: 'wf-sub-block' },
            el('div', { class: 'wf-sub-title' }, t('assumptionsHeading')),
            el('ul', { class: 'wf-assump-list' }, ...out.assumptions.map(item => el('li', {}, String(item)))),
          )
        : null,
      el('div', { class: 'wf-sub-title' }, t('directionsHeading')),
      el(
        'div',
        { class: 'wf-dir-mini-grid' },
        ...out.directions.map(dir =>
          el(
            'div',
            { class: 'wf-dir-mini' },
            el('strong', {}, dir.name || dir.id || ''),
            dir.rationale ? el('p', {}, dir.rationale) : null,
            dir.palette ? el('div', { class: 'hint-sm mono' }, dir.palette) : null,
            dir.typography ? el('div', { class: 'hint-sm' }, dir.typography) : null,
          ),
        ),
      ),
    );
  }

  if (nodeId === 'critique_artifact' && typeof out.score === 'number') {
    const axes = out.axes && typeof out.axes === 'object' ? Object.entries(out.axes) : [];
    const findings = Array.isArray(out.findings) ? out.findings : [];
    return el(
      'div',
      { class: 'wf-node-structured' },
      el(
        'div',
        { class: 'row-between' },
        el('strong', {}, `${t('critiqueScoreHeading')} · ${out.score}/100`),
        el('span', { class: `pill ${out.passed ? 'ok' : 'warn'}` }, out.passed ? t('critiquePassed') : t('critiqueNeedsFix')),
      ),
      out.summary ? el('p', { class: 'muted-line' }, out.summary) : null,
      axes.length
        ? el(
            'div',
            { class: 'wf-axes-bars' },
            ...axes.map(([axis, score]) => {
              const num = Math.max(0, Math.min(100, Number(score) || 0));
              return el(
                'div',
                { class: 'wf-axis-bar-row' },
                el('span', {}, axis),
                el('div', { class: 'wf-axis-track' }, el('div', { class: 'wf-axis-fill', style: `width:${num}%` })),
                el('b', { class: 'mono' }, String(num)),
              );
            }),
          )
        : null,
      findings.length
        ? el('ul', { class: 'wf-assump-list' }, ...findings.map(item => el('li', {}, typeof item === 'string' ? item : JSON.stringify(item))))
        : null,
    );
  }

  if ((nodeId === 'lint_artifact' || nodeId === 'lint_revision') && typeof out.ok === 'boolean') {
    const issues = Array.isArray(out.issues) ? out.issues : [];
    return el(
      'div',
      { class: 'wf-node-structured' },
      el(
        'div',
        { class: 'row-between' },
        el('span', { class: `pill ${out.ok ? 'ok' : 'warn'}` }, out.ok ? t('lintPassedMsg') : t('lintIssuesCount', { n: issues.length })),
        out.oidCount !== undefined ? el('span', { class: 'hint-sm mono' }, `data-od-id: ${out.oidCount}`) : null,
      ),
      issues.length
        ? el('ul', { class: 'wf-assump-list' }, ...issues.map(item => el('li', {}, typeof item === 'string' ? item : item?.message || JSON.stringify(item))))
        : null,
    );
  }

  if (nodeId === 'load_context' || nodeId === 'prepare_revision') {
    const chips = [
      out.systemSlug ? `system: ${out.systemSlug}` : null,
      typeof out.designMd === 'string' ? `DESIGN.md: ${out.designMd.length} chars` : null,
      typeof out.tokensCss === 'string' ? `tokens.css: ${out.tokensCss.length} chars` : null,
      out.commentCount !== undefined ? `comments: ${out.commentCount}` : null,
      out.tweakCount !== undefined ? `tweaks: ${out.tweakCount}` : null,
    ].filter(Boolean);
    if (!chips.length) return null;
    return el('div', { class: 'wf-chip-row' }, ...chips.map(c => el('span', { class: 'slug-pill mono' }, c)));
  }

  if (nodeId === 'finalize' || nodeId === 'finalize_revision') {
    const artId = run.inputs?.artifactId;
    const outPath = out.path || out.targetPath || run.inputs?.targetPath;
    return el(
      'div',
      { class: 'wf-node-structured row-between' },
      outPath ? el('span', { class: 'mono slug-pill' }, outPath) : el('span', { class: 'pill ok' }, t('statusCompleted')),
      artId
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn primary sm',
              onclick: () => {
                state.artifactId = artId;
                state.view = 'canvas';
                renderAll();
              },
            },
            t('openArtifactInCanvas'),
          )
        : null,
    );
  }

  return null;
}

function renderNodeDetail(run) {
  const card = $('node-detail-card');
  const topo = WORKFLOW_TOPOLOGIES[run.workflowId] || WORKFLOW_TOPOLOGIES['design-artifact'];
  const nodeId = resolveActiveNodeId(run, topo);
  const topoNode = topo.find(n => n.id === nodeId);
  const rec = (run.nodes || []).find(n => n.nodeId === nodeId);
  const recState = rec?.state || (run.pausedGate?.nodeId === nodeId ? 'waiting_gate' : 'pending');
  const out = run.outputs?.[nodeId] ?? (rec?.outputJson ? safeJsonParse(rec.outputJson) : null);
  const durationSec =
    rec?.startedAt && rec?.finishedAt && rec.finishedAt >= rec.startedAt
      ? ((rec.finishedAt - rec.startedAt) / 1000).toFixed(1)
      : null;

  const structuredEl = renderNodeStructuredView(run, nodeId, out);
  const jsonPretty = out != null ? (typeof out === 'string' ? out : JSON.stringify(out, null, 2)) : '';

  let bodyEl = null;
  if (out != null) {
    const treeWrap = el('div', { class: 'wf-jtree' }, typeof out === 'object' ? renderJsonNodeEl(out, { defaultDepth: 2 }) : el('pre', { class: 'md-viewer mono' }, jsonPretty));
    if (structuredEl) {
      const fold = el('details', { class: 'wf-json-fold' }, el('summary', { class: 'wf-json-fold-sum' }, t('rawJsonSection')), treeWrap);
      bodyEl = el('div', { class: 'wf-detail-body' }, structuredEl, fold);
    } else {
      bodyEl = el('div', { class: 'wf-detail-body' }, treeWrap);
    }
  } else {
    const emptyMsg = recState === 'running' ? t('nodeRunningHint') : recState === 'pending' ? t('nodePendingHint') : t('noOutputYet');
    bodyEl = el('p', { class: 'hint-sm wf-empty-hint' }, emptyMsg);
  }

  card.replaceChildren(
    el(
      'div',
      { class: 'row-between' },
      el(
        'div',
        { class: 'sys-title-row' },
        el('strong', {}, topoNode?.label || t('nodeDetails')),
        el('span', { class: 'mono slug-pill' }, nodeId),
        el('span', { class: `pill ${statusPillClass(recState)}` }, statusLabel(recState)),
        durationSec !== null ? el('span', { class: 'hint-sm mono' }, t('durationMs', { sec: durationSec })) : null,
      ),
      el(
        'div',
        { class: 'sys-head-actions' },
        out != null
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn sm',
                onclick: () => {
                  void navigator.clipboard?.writeText(jsonPretty).then(() => toast(t('copied'))).catch(() => {});
                },
              },
              t('copyJson'),
            )
          : null,
        rec?.sessionId
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn sm',
                onclick: () => window.deck.agent.open(rec.sessionId, { closeDeck: false }).catch(err => toast(err.message, true)),
              },
              t('openSession'),
            )
          : null,
        rec?.state === 'failed'
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn sm',
                onclick: () => retryWorkflowNode(run.runId, nodeId),
              },
              t('retryNode'),
            )
          : null,
      ),
    ),
    rec?.error ? el('p', { class: 'err' }, rec.error) : null,
    bodyEl,
  );
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function renderAll() {
  renderTopbar();
  renderArtifactRail();
  syncCanvasFrame(false);
  renderInspector();
  if (state.view === 'systems') renderSystemsView();
  if (state.view === 'workflows') renderWorkflowsView();
}

// ---------- Actions (Persistence & Workflows)

async function saveStore(collection, key, value) {
  if (state.preview) return;
  await window.deck.store.put(collection, key, value);
}

async function ensureSystemFiles(sys) {
  if (state.preview) return;
  const base = `.lumzel/opendesign/design-systems/${sys.slug}`;
  await window.deck.files.write(`${base}/DESIGN.md`, sys.designMd || '');
  await window.deck.files.write(`${base}/tokens.css`, sys.tokensCss || '');
}

async function activateSystem(slug) {
  state.activeSystemSlug = slug;
  const sys = systemBySlug(slug);
  if (!state.preview) {
    await saveStore('meta', 'activeSystem', slug);
    await ensureSystemFiles(sys);
  }
  toast(t('systemActivated', { name: sys.name }));
  renderAll();
}

async function pinComment() {
  const art = currentArtifact();
  const input = $('comment-input');
  const note = input.value.trim();
  if (!art || !note) return;
  const item = {
    id: `c-${Date.now().toString(36)}`,
    oid: state.selectedEl?.oid || '',
    tag: state.selectedEl?.tag || 'canvas',
    selector: state.selectedEl?.selector || 'canvas',
    note,
    createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  const next = [...(state.comments[art.id] || []), item];
  state.comments[art.id] = next;
  input.value = '';
  if (!state.preview) await saveStore('comments', art.id, next);
  renderInspector();
}

async function removeComment(artifactId, commentId) {
  const next = (state.comments[artifactId] || []).filter(c => c.id !== commentId);
  state.comments[artifactId] = next;
  if (!state.preview) await saveStore('comments', artifactId, next);
  renderInspector();
}

async function clearComments() {
  const art = currentArtifact();
  if (!art) return;
  state.comments[art.id] = [];
  if (!state.preview) await saveStore('comments', art.id, []);
  renderInspector();
}

async function applyRevisions() {
  if (state.preview) return toast(t('previewDisabled'), true);
  const art = currentArtifact();
  if (!art) return;
  const comments = state.comments[art.id] || [];
  const instruction = $('revise-instruction').value.trim();
  if (!comments.length && !Object.keys(state.tweaks).length && !instruction) {
    return toast(t('errRequired'), true);
  }
  const sys = systemBySlug(art.systemSlug || state.activeSystemSlug);
  await ensureSystemFiles(sys);
  const snapshotPath = `.lumzel/opendesign/versions/${art.id}/v${art.version || 1}.html`;
  await window.deck.files.write(snapshotPath, art.html || '');

  const notes = typeof state.params?.designNotes === 'string' ? state.params.designNotes.trim() : '';
  const combinedInstruction = notes
    ? instruction
      ? `${instruction}\n\nProject Design Constraints:\n${notes}`
      : `Project Design Constraints:\n${notes}`
    : instruction;

  const run = await window.deck.workflow.run(
    'revise-artifact',
    {
      artifactId: art.id,
      sourcePath: art.path,
      targetPath: art.path,
      designSystemPath: `.lumzel/opendesign/design-systems/${sys.slug}/DESIGN.md`,
      tokensPath: `.lumzel/opendesign/design-systems/${sys.slug}/tokens.css`,
      commentsJson: JSON.stringify(comments),
      tweakOverridesJson: JSON.stringify(state.tweaks),
      instruction: combinedInstruction,
    },
    workflowAgentOptions(),
  );
  await registerWorkflowRun(run);
  state.view = 'workflows';
  renderAll();
  toast(t('workflowStarted', { id: 'revise-artifact' }));
}

async function saveTweaksToSystem() {
  if (state.preview) return toast(t('previewDisabled'), true);
  const sys = systemBySlug(currentArtifact()?.systemSlug || state.activeSystemSlug);
  const merged = { ...parseTokensCss(sys.tokensCss), ...state.tweaks };
  sys.tokensCss = serializeTokensCss(merged);
  await ensureSystemFiles(sys);
  if (!sys.builtin) {
    await saveStore('systems', sys.slug, sys);
  }
  state.tweaks = {};
  toast(t('savedMsg'));
  renderAll();
}

async function bakeTweaksIntoArtifact() {
  const art = currentArtifact();
  if (!art) return;
  const sys = systemBySlug(art.systemSlug || state.activeSystemSlug);
  const baked = buildStandaloneHtml(art.html, sys.tokensCss, state.tweaks);
  art.html = baked;
  art.version = (art.version || 1) + 1;
  art.updatedAt = new Date().toISOString();
  const vList = state.versions[art.id] || [];
  state.versions[art.id] = [
    { version: art.version, label: `v${art.version} · Tweak bake`, createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), html: baked },
    ...vList,
  ];
  state.tweaks = {};
  if (!state.preview) {
    await window.deck.files.write(art.path, baked);
    await saveStore('artifacts', art.id, { ...art, html: undefined });
    await saveStore('versions', art.id, state.versions[art.id]);
  }
  state.lastRenderedKey = '';
  toast(t('savedMsg'));
  renderAll();
}

async function exportCurrentArtifact() {
  const art = currentArtifact();
  if (!art) return;
  const sys = systemBySlug(art.systemSlug || state.activeSystemSlug);
  const standalone = buildStandaloneHtml(art.html, sys.tokensCss, state.tweaks);
  if (!state.preview) {
    const exportPath = `.lumzel/opendesign/exports/${art.id}.html`;
    await window.deck.files.write(exportPath, standalone);
    await window.deck.ui.open({ path: exportPath }).catch(() => {});
    toast(t('exported'));
  } else {
    await navigator.clipboard?.writeText(standalone).catch(() => {});
    toast(t('copied'));
  }
}

async function createStarterArtifact({ id, title, surface, systemSlug, brief }) {
  const sys = systemBySlug(systemSlug);
  const html = buildStarterHtml({ title, surface, brief, tokensCss: sys.tokensCss });
  const path = `docs/opendesign/${id}.html`;
  const art = {
    id,
    title,
    surface,
    systemSlug: sys.slug,
    path,
    brief,
    html,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  if (!state.preview) {
    await window.deck.files.write(path, html);
    await saveStore('artifacts', id, { ...art, html: undefined });
    await saveStore('versions', id, [{ version: 1, label: 'v1 · Starter', createdAt: 'now', html }]);
  }
  state.artifacts = [art, ...state.artifacts.filter(a => a.id !== id)];
  state.versions[id] = [{ version: 1, label: 'v1 · Starter', createdAt: 'now', html }];
  state.artifactId = id;
  state.activeVersion = null;
  state.lastRenderedKey = '';
  renderAll();
}

async function startDesignPipeline({ id, title, surface, systemSlug, brief, skipDirectionGate }) {
  if (state.preview) return toast(t('previewDisabled'), true);
  const sys = systemBySlug(systemSlug);
  await ensureSystemFiles(sys);
  const targetPath = `docs/opendesign/${id}.html`;
  const art = {
    id,
    title,
    surface,
    systemSlug: sys.slug,
    path: targetPath,
    brief,
    html: buildStarterHtml({ title, surface, brief, tokensCss: sys.tokensCss }),
    version: 1,
    updatedAt: new Date().toISOString(),
    fromDisk: false,
  };
  await saveStore('artifacts', id, { ...art, html: undefined });
  state.artifacts = [art, ...state.artifacts.filter(a => a.id !== id)];
  state.artifactId = id;

  const notes = typeof state.params?.designNotes === 'string' ? state.params.designNotes.trim() : '';
  const fullBrief = notes ? `${brief}\n\nProject Design Constraints:\n${notes}` : brief;

  const run = await window.deck.workflow.run(
    'design-artifact',
    {
      artifactId: id,
      title,
      surface,
      brief: fullBrief,
      systemSlug: sys.slug,
      targetPath,
      designSystemPath: `.lumzel/opendesign/design-systems/${sys.slug}/DESIGN.md`,
      tokensPath: `.lumzel/opendesign/design-systems/${sys.slug}/tokens.css`,
      skipDirectionGate: Boolean(skipDirectionGate),
    },
    workflowAgentOptions(),
  );
  await registerWorkflowRun(run);
  state.view = 'workflows';
  renderAll();
  toast(t('workflowStarted', { id: 'design-artifact' }));
}

async function startExtractPipeline({ name, slug, sourceKind, sourceValue }) {
  if (state.preview) return toast(t('previewDisabled'), true);
  const outDir = `.lumzel/opendesign/design-systems/${slug}`;
  const run = await window.deck.workflow.run(
    'extract-design-system',
    {
      slug,
      name,
      sourceKind,
      sourceValue,
      outDir,
    },
    workflowAgentOptions(),
  );
  await registerWorkflowRun(run);
  state.view = 'workflows';
  renderAll();
  toast(t('workflowStarted', { id: 'extract-design-system' }));
}

async function registerWorkflowRun(run) {
  if (!run?.runId) return;
  upsertRun(run);
  state.selectedRunId = run.runId;
  if (!state.preview) {
    await saveStore('runs', run.runId, { runId: run.runId, workflowId: run.workflowId, inputs: run.inputs || {} });
  }
}

function upsertRun(run) {
  if (!run?.runId) return;
  const idx = state.runs.findIndex(r => r.runId === run.runId);
  if (idx >= 0) state.runs[idx] = run;
  else state.runs.unshift(run);
}

async function handleWorkflowCompleted(run) {
  if (!run || run.state !== 'completed') return;
  if (run.workflowId === 'design-artifact' || run.workflowId === 'revise-artifact') {
    const id = run.inputs?.artifactId;
    const path = run.inputs?.targetPath;
    if (id && path) {
      const file = await window.deck.files.read(path).catch(() => null);
      const art = state.artifacts.find(a => a.id === id);
      if (art && file?.content) {
        art.html = file.content;
        art.fromDisk = true;
        art.version = run.workflowId === 'revise-artifact' ? (art.version || 1) + 1 : art.version || 1;
        art.critique = run.outputs?.critique_artifact || art.critique;
        art.lint = run.outputs?.lint_artifact || run.outputs?.lint_revision || art.lint;
        art.updatedAt = new Date().toISOString();
        await saveStore('artifacts', art.id, { ...art, html: undefined });
        const vers = state.versions[art.id] || [];
        state.versions[art.id] = [
          {
            version: art.version,
            label: `v${art.version} · ${run.workflowId === 'revise-artifact' ? 'AI revision' : 'AI build'}`,
            createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            html: file.content,
          },
          ...vers,
        ];
        await saveStore('versions', art.id, state.versions[art.id]);
        if (run.workflowId === 'revise-artifact') {
          state.comments[art.id] = [];
          await saveStore('comments', art.id, []);
        }
        state.lastRenderedKey = '';
      }
    }
  } else if (run.workflowId === 'extract-design-system') {
    const slug = run.inputs?.slug;
    const outDir = run.inputs?.outDir;
    if (slug && outDir) {
      const md = await window.deck.files.read(`${outDir}/DESIGN.md`).catch(() => null);
      const css = await window.deck.files.read(`${outDir}/tokens.css`).catch(() => null);
      const parsed = parseTokensCss(css?.content || '');
      const sys = {
        slug,
        name: run.inputs?.name || slug,
        tagline: `Extracted from ${run.inputs?.sourceKind || 'project'}`,
        builtin: false,
        swatches: [parsed['--od-bg'], parsed['--od-surface'], parsed['--od-fg'], parsed['--od-accent'], parsed['--od-border']],
        designMd: md?.content || '',
        tokensCss: css?.content || '',
      };
      await saveStore('systems', slug, sys);
      state.systems = [...state.systems.filter(s => s.slug !== slug), sys];
      state.selectedSystemSlug = slug;
    }
  }
}

async function resumeDirectionGate(run, dir) {
  if (state.preview) return toast(t('previewDisabled'), true);
  await window.deck.workflow.resumeGate(run.runId, 'direction_gate', 'approve', {
    directionId: dir.id,
    direction: dir,
    steering: state.steeringText,
  });
  state.steeringText = '';
  const updated = await window.deck.workflow.getRun(run.runId).catch(() => null);
  if (updated) upsertRun(updated);
  renderWorkflowsView();
}

async function retryWorkflowNode(runId, nodeId) {
  if (state.preview) return;
  const updated = await window.deck.workflow.retryNode(runId, nodeId).catch(err => {
    toast(err.message, true);
    return null;
  });
  if (updated) upsertRun(updated);
  renderWorkflowsView();
}

// ---------- Modals & Init

function initSelects() {
  for (const id of [
    'od-agent-select',
    'od-model-select',
    'od-effort-select',
    'new-surface',
    'new-system',
    'new-agent',
    'new-model',
    'new-effort',
    'ext-source-kind',
    'ext-agent',
    'ext-model',
    'ext-effort',
  ]) {
    initUiSelect($(id));
  }
}

function openNewDesignModal() {
  state.agentMenuOpen = false;
  $('new-title').value = '';
  $('new-brief').value = '';
  delete $('new-id').dataset.touched;

  const rawDefaultSurface = state.params?.defaultSurface;
  const normalizedSurface = rawDefaultSurface === 'slide' ? 'slides' : rawDefaultSurface || 'prototype';
  renderStaticSelects();
  setUiSelectValue($('new-surface'), normalizedSurface);

  setUiSelectOptions(
    $('new-system'),
    state.systems.map(s => {
      const parsed = parseTokensCss(s.tokensCss);
      return {
        value: s.slug,
        label: s.name,
        swatch: parsed['--od-accent'] || s.swatches?.[3] || '#0070e3',
      };
    }),
    state.activeSystemSlug,
  );

  state.draftAutoId = generateArtifactId('', getUiSelectValue($('new-surface')) || 'prototype');
  $('new-id').value = state.draftAutoId;

  if ($('new-skip-gate')) {
    $('new-skip-gate').checked = Boolean(state.params?.skipDirectionGate);
  }
  $('new-err').textContent = '';
  renderAgentControls();
  $('modal-new').hidden = false;
  $('new-title').focus();
}

function openExtractModal() {
  state.agentMenuOpen = false;
  $('ext-name').value = '';
  $('ext-source-val').value = '';
  delete $('ext-slug').dataset.touched;
  renderStaticSelects();
  state.draftSystemSlug = generateSystemSlug('');
  $('ext-slug').value = state.draftSystemSlug;
  $('ext-err').textContent = '';
  renderAgentControls();
  $('modal-extract').hidden = false;
  $('ext-name').focus();
}

function bindEvents() {
  initSelects();

  for (const btn of document.querySelectorAll('.main-tab')) {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderAll();
    });
  }
  $('btn-toggle-rail')?.addEventListener('click', () => {
    state.narrowDrawer = state.narrowDrawer === 'rail' ? '' : 'rail';
    syncNarrowDrawers();
  });
  $('btn-toggle-inspector')?.addEventListener('click', () => {
    state.narrowDrawer = state.narrowDrawer === 'inspector' ? '' : 'inspector';
    syncNarrowDrawers();
  });
  $('btn-close-rail')?.addEventListener('click', () => {
    state.narrowDrawer = '';
    syncNarrowDrawers();
  });
  $('btn-close-inspector')?.addEventListener('click', () => {
    state.narrowDrawer = '';
    syncNarrowDrawers();
  });
  $('drawer-scrim')?.addEventListener('click', () => {
    state.narrowDrawer = '';
    syncNarrowDrawers();
  });
  const narrowMql = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 980px)') : null;
  if (narrowMql) {
    const onBpChange = () => {
      if (!narrowMql.matches && state.narrowDrawer) {
        state.narrowDrawer = '';
        syncNarrowDrawers();
      }
    };
    if (typeof narrowMql.addEventListener === 'function') narrowMql.addEventListener('change', onBpChange);
    else narrowMql.addListener?.(onBpChange);
  }
  window.addEventListener('resize', () => {
    if (!isNarrowViewport() && state.narrowDrawer) {
      state.narrowDrawer = '';
      syncNarrowDrawers();
    }
  });

  $('agent-override-pill').addEventListener('click', e => {
    e.stopPropagation();
    state.agentMenuOpen = !state.agentMenuOpen;
    renderAgentControls();
  });
  $('revise-agent-chip').addEventListener('click', e => {
    e.stopPropagation();
    state.agentMenuOpen = true;
    renderAgentControls();
    focusUiSelect($('od-model-select'));
  });
  $('od-agent-reset').addEventListener('click', () => {
    resetAgentDefaults();
  });
  $('od-agent-save-default').addEventListener('click', () => {
    saveAgentAsProjectDefault();
  });
  for (const [agentId, modelId, effortId] of [
    ['od-agent-select', 'od-model-select', 'od-effort-select'],
    ['new-agent', 'new-model', 'new-effort'],
    ['ext-agent', 'ext-model', 'ext-effort'],
  ]) {
    $(agentId).addEventListener('change', e => {
      setAgentOverride({ provider: getUiSelectValue(e.currentTarget), model: '', effort: '' });
    });
    $(modelId).addEventListener('change', e => {
      setAgentOverride({ model: getUiSelectValue(e.currentTarget), effort: '' });
    });
    $(effortId).addEventListener('change', e => {
      setAgentOverride({ effort: getUiSelectValue(e.currentTarget) });
    });
  }
  document.addEventListener('pointerdown', e => {
    if (!state.agentMenuOpen) return;
    const wrap = $('agent-override-wrap');
    if (
      wrap &&
      !wrap.contains(e.target) &&
      !isSelectMenuOwnedBy(e.target, wrap) &&
      e.target !== $('revise-agent-chip') &&
      !$('revise-agent-chip')?.contains(e.target)
    ) {
      state.agentMenuOpen = false;
      renderAgentControls();
    }
  });
  window.addEventListener('blur', () => {
    if (state.agentMenuOpen && document.activeElement === $('canvas-iframe')) {
      state.agentMenuOpen = false;
      renderAgentControls();
    }
  });
  $('active-sys-pill').addEventListener('click', () => {
    state.selectedSystemSlug = state.activeSystemSlug;
    state.view = 'systems';
    renderAll();
  });
  $('btn-new-design').addEventListener('click', openNewDesignModal);
  $('empty-create-btn').addEventListener('click', openNewDesignModal);
  $('btn-wf-new-design').addEventListener('click', openNewDesignModal);
  $('btn-open-extract').addEventListener('click', openExtractModal);
  $('btn-wf-extract').addEventListener('click', openExtractModal);
  $('btn-deck-settings')?.addEventListener('click', () => {
    window.deck?.ui?.openSettings?.().catch(() => {});
  });
  $('btn-refresh').addEventListener('click', () => loadWorkspace());

  $('empty-starter-btn').addEventListener('click', () => {
    createStarterArtifact({
      id: 'meridian-billing',
      title: SAMPLE_ARTIFACTS[0].title,
      surface: 'prototype',
      systemSlug: state.activeSystemSlug,
      brief: SAMPLE_ARTIFACTS[0].brief,
    });
  });

  for (const btn of document.querySelectorAll('[data-mode]')) {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      for (const b of document.querySelectorAll('[data-mode]')) b.classList.toggle('on', b === btn);
      if (state.mode === 'tweaks') state.insTab = 'tweaks';
      if (state.mode === 'inspect') state.insTab = 'comments';
      syncCanvasFrame(false);
      renderInspector();
    });
  }

  for (const btn of document.querySelectorAll('[data-vp]')) {
    btn.addEventListener('click', () => {
      state.viewport = btn.dataset.vp;
      for (const b of document.querySelectorAll('[data-vp]')) b.classList.toggle('on', b === btn);
      syncCanvasFrame(false);
    });
  }

  for (const btn of document.querySelectorAll('[data-instab]')) {
    btn.addEventListener('click', () => {
      state.insTab = btn.dataset.instab;
      renderInspector();
    });
  }

  for (const btn of document.querySelectorAll('[data-systab]')) {
    btn.addEventListener('click', () => {
      state.sysTab = btn.dataset.systab;
      renderSystemsView();
    });
  }

  $('btn-open-file').addEventListener('click', () => {
    const art = currentArtifact();
    if (!art) return;
    if (state.preview) return toast(t('previewDisabled'), true);
    window.deck.ui.open({ path: art.path }).catch(err => toast(err.message, true));
  });
  $('btn-export-html').addEventListener('click', exportCurrentArtifact);
  $('btn-copy-html').addEventListener('click', () => {
    navigator.clipboard?.writeText($('code-editor').value || '').catch(() => {});
    toast(t('copied'));
  });
  $('code-editor').addEventListener('change', async () => {
    const art = currentArtifact();
    if (!art) return;
    art.html = $('code-editor').value;
    art.updatedAt = new Date().toISOString();
    state.lastRenderedKey = '';
    if (!state.preview) {
      await window.deck.files.write(art.path, art.html);
      await saveStore('artifacts', art.id, { ...art, html: undefined });
    }
    toast(t('savedMsg'));
  });

  $('btn-pin-comment').addEventListener('click', pinComment);
  $('btn-clear-comments').addEventListener('click', clearComments);
  $('btn-apply-revisions').addEventListener('click', applyRevisions);
  $('btn-reset-tweaks').addEventListener('click', () => {
    state.tweaks = {};
    postToCanvas({ type: 'od:tweak', tweaks: {} });
    renderTweaksTab();
  });
  $('btn-save-tokens').addEventListener('click', saveTweaksToSystem);
  $('btn-bake-artifact').addEventListener('click', bakeTweaksIntoArtifact);

  $('btn-activate-system').addEventListener('click', () => activateSystem(state.selectedSystemSlug));
  $('btn-export-designmd').addEventListener('click', async () => {
    const sys = selectedSystem();
    if (!state.preview) {
      await ensureSystemFiles(sys);
      await window.deck.ui.open({ path: `.lumzel/opendesign/design-systems/${sys.slug}/DESIGN.md` }).catch(() => {});
      toast(t('savedMsg'));
    } else {
      await navigator.clipboard?.writeText(sys.designMd || '').catch(() => {});
      toast(t('copied'));
    }
  });
  $('btn-save-sys-tokens').addEventListener('click', async () => {
    if (state.preview) return toast(t('previewDisabled'), true);
    const sys = selectedSystem();
    sys.tokensCss = $('sys-tokens-editor').value;
    await ensureSystemFiles(sys);
    if (!sys.builtin) await saveStore('systems', sys.slug, sys);
    toast(t('savedMsg'));
    renderSystemsView();
    syncCanvasFrame(false);
  });

  $('btn-wf-stop').addEventListener('click', async () => {
    if (state.preview || !state.selectedRunId) return;
    await window.deck.workflow.stop(state.selectedRunId).catch(() => {});
  });

  // Modals
  $('new-title').addEventListener('input', e => {
    if ($('new-id').dataset.touched) return;
    const slug = slugify(e.target.value);
    const used = new Set(state.artifacts.map(a => a.id));
    $('new-id').value = slug ? ensureUniqueSlug(slug, used) : state.draftAutoId;
  });
  $('new-surface').addEventListener('change', () => {
    if ($('new-id').dataset.touched || slugify($('new-title').value)) return;
    state.draftAutoId = generateArtifactId('', getUiSelectValue($('new-surface')) || 'prototype');
    $('new-id').value = state.draftAutoId;
  });
  $('new-id').addEventListener('input', () => {
    if ($('new-id').value.trim()) $('new-id').dataset.touched = '1';
    else delete $('new-id').dataset.touched;
  });
  $('btn-regen-id').addEventListener('click', () => {
    delete $('new-id').dataset.touched;
    const surface = getUiSelectValue($('new-surface')) || 'prototype';
    const nextId = generateArtifactId('', surface, $('new-id').value.trim());
    state.draftAutoId = nextId;
    $('new-id').value = nextId;
    $('new-err').textContent = '';
  });
  $('new-cancel').addEventListener('click', () => ($('modal-new').hidden = true));
  $('new-starter').addEventListener('click', async () => {
    const title = $('new-title').value.trim();
    const surface = getUiSelectValue($('new-surface')) || 'prototype';
    const rawId = $('new-id').value.trim();
    const id = rawId || generateArtifactId(title, surface);
    if (!rawId) $('new-id').value = id;
    if (!title || !/^[a-z0-9-]+$/.test(id)) {
      $('new-err').textContent = !title ? t('errRequired') : t('errIdInvalid');
      return;
    }
    $('modal-new').hidden = true;
    await createStarterArtifact({
      id,
      title,
      surface,
      systemSlug: getUiSelectValue($('new-system')) || state.activeSystemSlug,
      brief: $('new-brief').value.trim(),
    });
  });
  $('new-run').addEventListener('click', async () => {
    const title = $('new-title').value.trim();
    const surface = getUiSelectValue($('new-surface')) || 'prototype';
    const rawId = $('new-id').value.trim();
    const id = rawId || generateArtifactId(title, surface);
    if (!rawId) $('new-id').value = id;
    const brief = $('new-brief').value.trim();
    if (!title || !brief || !/^[a-z0-9-]+$/.test(id)) {
      $('new-err').textContent = !title || !brief ? t('errRequired') : t('errIdInvalid');
      return;
    }
    $('modal-new').hidden = true;
    await startDesignPipeline({
      id,
      title,
      surface,
      systemSlug: getUiSelectValue($('new-system')) || state.activeSystemSlug,
      brief,
      skipDirectionGate: $('new-skip-gate').checked,
    });
  });

  $('ext-name').addEventListener('input', e => {
    if ($('ext-slug').dataset.touched) return;
    const slug = slugify(e.target.value);
    const used = new Set(state.systems.map(s => s.slug));
    $('ext-slug').value = slug ? ensureUniqueSlug(slug, used) : state.draftSystemSlug;
  });
  $('ext-slug').addEventListener('input', () => {
    if ($('ext-slug').value.trim()) $('ext-slug').dataset.touched = '1';
    else delete $('ext-slug').dataset.touched;
  });
  $('btn-regen-slug').addEventListener('click', () => {
    delete $('ext-slug').dataset.touched;
    const nextSlug = generateSystemSlug('', $('ext-slug').value.trim());
    state.draftSystemSlug = nextSlug;
    $('ext-slug').value = nextSlug;
    $('ext-err').textContent = '';
  });
  $('ext-cancel').addEventListener('click', () => ($('modal-extract').hidden = true));
  $('ext-run').addEventListener('click', async () => {
    const name = $('ext-name').value.trim();
    const rawSlug = $('ext-slug').value.trim();
    const slug = rawSlug || generateSystemSlug(name);
    if (!rawSlug) $('ext-slug').value = slug;
    const sourceValue = $('ext-source-val').value.trim();
    if (!name || !sourceValue || !/^[a-z0-9-]+$/.test(slug)) {
      $('ext-err').textContent = !name || !sourceValue ? t('errRequired') : t('errIdInvalid');
      return;
    }
    $('modal-extract').hidden = true;
    await startExtractPipeline({
      name,
      slug,
      sourceKind: getUiSelectValue($('ext-source-kind')) || 'codebase',
      sourceValue,
    });
  });

  window.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      $('modal-new').hidden = true;
      $('modal-extract').hidden = true;
      if (state.agentMenuOpen) {
        state.agentMenuOpen = false;
        renderAgentControls();
      }
      if (state.narrowDrawer) {
        state.narrowDrawer = '';
        syncNarrowDrawers();
      }
    }
  });

  window.addEventListener('message', event => {
    const msg = event?.data;
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'od:ready') {
      const art = currentArtifact();
      if (!art) return;
      const sys = systemBySlug(art.systemSlug || state.activeSystemSlug);
      postToCanvas({ type: 'od:tokens', tokensCss: sys.tokensCss, tweaks: state.tweaks });
      postToCanvas({ type: 'od:mode', mode: state.mode === 'inspect' ? 'inspect' : 'preview' });
    } else if (msg.type === 'od:select') {
      state.selectedEl = msg;
      state.insTab = 'comments';
      if (isNarrowViewport()) state.narrowDrawer = 'inspector';
      renderInspector();
      syncNarrowDrawers();
      $('comment-input').focus();
    }
  });
}

async function loadWorkspace() {
  let ctx = {};
  try {
    ctx = await window.deck.context();
  } catch {
    ctx = { preview: true, theme: 'light', locale: 'en' };
  }

  state.preview = Boolean(ctx.preview);
  state.theme = ctx.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  if (!unsubTheme && typeof window.deck?.ui?.onThemeChange === 'function') {
    unsubTheme = window.deck.ui.onThemeChange(nextTheme => {
      state.theme = nextTheme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = state.theme;
    });
  }
  setLocale(ctx.locale || 'en');
  applyI18n();
  renderStaticSelects();

  if (state.preview) {
    $('banner').textContent = t('previewBanner');
    $('banner').hidden = false;
    state.systems = PRESET_SYSTEMS.map(s => ({ ...s }));
    state.activeSystemSlug = 'editorial-slate';
    state.selectedSystemSlug = 'editorial-slate';
    state.artifacts = SAMPLE_ARTIFACTS.map(a => ({ ...a }));
    state.artifactId = state.artifacts[0].id;
    state.comments = structuredClone(SAMPLE_COMMENTS);
    state.versions = structuredClone(SAMPLE_VERSIONS);
    state.runs = structuredClone(SAMPLE_RUNS);
    state.selectedRunId = state.runs[0].runId;
    state.agentCatalog = SAMPLE_AGENT_CATALOG;
    state.selectedAgent = { provider: '', model: '', effort: '' };
    renderAll();
    return;
  }

  $('banner').hidden = true;
  const [activeSys, catalogRes, savedAgentOverride, paramsRes] = await Promise.all([
    window.deck.store.get('meta', 'activeSystem').catch(() => null),
    window.deck.agent?.catalog?.().catch(() => null),
    window.deck.store.get('meta', 'agentOverride').catch(() => null),
    window.deck.params?.get?.().catch(() => null),
  ]);
  state.agentCatalog = catalogRes || null;
  state.selectedAgent = sanitizeSelectedAgent(savedAgentOverride, state.agentCatalog);
  if (paramsRes?.values && typeof paramsRes.values === 'object') {
    state.params = { ...state.params, ...paramsRes.values };
  }
  const customSystems = await window.deck.store.list({ collection: 'systems' }).catch(() => []);
  const customMap = new Map(customSystems.map(e => [e.key, e.value]));
  state.systems = [
    ...PRESET_SYSTEMS.map(s => ({ ...s })),
    ...Array.from(customMap.values()),
  ];
  state.activeSystemSlug = typeof activeSys === 'string' && activeSys ? activeSys : 'editorial-slate';
  state.selectedSystemSlug = state.activeSystemSlug;

  const storedArts = await window.deck.store.list({ collection: 'artifacts' }).catch(() => []);
  const artifacts = [];
  for (const entry of storedArts) {
    const meta = entry.value;
    if (!meta?.id || !meta?.path) continue;
    const file = await window.deck.files.read(meta.path).catch(() => null);
    artifacts.push({
      ...meta,
      html: file?.content || buildStarterHtml(meta),
      fromDisk: Boolean(file?.content),
    });
  }

  const diskFiles = await window.deck.files.list('docs/opendesign').catch(() => []);
  for (const f of diskFiles) {
    if (!f?.name?.endsWith('.html')) continue;
    const id = f.name.replace(/\.html$/i, '');
    if (artifacts.some(a => a.id === id)) continue;
    const path = `docs/opendesign/${f.name}`;
    const file = await window.deck.files.read(path).catch(() => null);
    if (!file?.content) continue;
    artifacts.push({
      id,
      title: id,
      surface: 'prototype',
      systemSlug: state.activeSystemSlug,
      path,
      html: file.content,
      version: 1,
      fromDisk: true,
    });
  }

  state.artifacts = artifacts;
  if (!state.artifactId || !artifacts.some(a => a.id === state.artifactId)) {
    state.artifactId = artifacts[0]?.id || '';
  }

  const commentEntries = await window.deck.store.list({ collection: 'comments' }).catch(() => []);
  state.comments = Object.fromEntries(commentEntries.map(e => [e.key, Array.isArray(e.value) ? e.value : []]));

  const versionEntries = await window.deck.store.list({ collection: 'versions' }).catch(() => []);
  state.versions = Object.fromEntries(versionEntries.map(e => [e.key, Array.isArray(e.value) ? e.value : []]));

  const runEntries = await window.deck.store.list({ collection: 'runs' }).catch(() => []);
  const loadedRuns = [];
  for (const e of runEntries.slice(0, 12)) {
    const run = await window.deck.workflow.getRun(e.key).catch(() => null);
    if (run) loadedRuns.push(run);
  }
  state.runs = loadedRuns;
  if (!state.selectedRunId && loadedRuns[0]) state.selectedRunId = loadedRuns[0].runId;

  if (!unsubWorkflow) {
    unsubWorkflow = window.deck.workflow.subscribe('*', async evt => {
      const run = evt?.run || evt;
      if (!run?.runId) return;
      const prev = state.runs.find(r => r.runId === run.runId);
      upsertRun(run);
      if (prev?.state !== 'completed' && run.state === 'completed') {
        await handleWorkflowCompleted(run);
      }
      renderAll();
    });
  }

  if (!unsubAgentDefaults && typeof window.deck.agent?.onDefaults === 'function') {
    unsubAgentDefaults = window.deck.agent.onDefaults(async evt => {
      const nextDefaults = evt?.defaults || {
        provider: evt?.provider || '',
        model: evt?.model || '',
        effort: evt?.effort || '',
      };
      if (!state.agentCatalog) {
        state.agentCatalog = await window.deck.agent?.catalog?.().catch(() => null);
      }
      if (state.agentCatalog) {
        state.agentCatalog = {
          ...state.agentCatalog,
          defaults: nextDefaults,
        };
      }
      const prev = state.selectedAgent;
      const next = sanitizeSelectedAgent(prev, state.agentCatalog);
      state.selectedAgent = next;
      if (next.provider !== prev.provider || next.model !== prev.model || next.effort !== prev.effort) {
        saveStore('meta', 'agentOverride', next).catch(() => {});
      }
      renderAgentControls();
    });
  }

  if (!unsubParams && typeof window.deck.params?.onChange === 'function') {
    unsubParams = window.deck.params.onChange(evt => {
      if (evt?.values && typeof evt.values === 'object') {
        state.params = { ...state.params, ...evt.values };
      }
    });
  }

  renderAll();
}

bindEvents();
loadWorkspace().then(() => {
  $('app').dataset.state = 'ready';
});
