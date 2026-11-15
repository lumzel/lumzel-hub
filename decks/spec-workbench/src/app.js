// 方案工作台 (spec-workbench): Features (design, tickets, prototype) and the doc hub of the open Worktree,
// for any project. The list comes from deck.docs.index(); every page opens in a frame at worktree/<path>
// (read-only route). The Deck draws the frame (rail, tabs, ticket list); each doc renders itself with the
// Deck's own runtime (runtime/worktree.js, which Lumzel appends to every Worktree page the Deck frames).
import { t, applyI18n, setLocale } from './i18n.js';
import { SAMPLE_INDEX } from './sample.js';

const $ = id => document.getElementById(id);
const app = $('app');
applyI18n();

const state = {
  index: { features: [], docs: [] },
  theme: 'light',
  preview: false, // shown from a market, not installed: the sample project, and no Session can start
  view: 'feature', // 'feature' | 'hub'
  featureId: '',
  tab: 'design',
  filter: 'all',
  ticket: '', // open ticket path, tickets tab
  hubDoc: '',
  screen: '', // current prototype screen, reported by lumzel-prototype.js
  agentCatalog: null,
  agentOverride: { provider: '', model: '', effort: '' },
  params: { tddStrictness: 'balanced', autoTickets: false, designRules: '' },
};

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

function effectiveAgentInfo(catalog = state.agentCatalog, selected = state.agentOverride) {
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

function agentRunOptions() {
  const sel = state.agentOverride || {};
  if (!sel.provider && !sel.model && !sel.effort) return {};
  const info = effectiveAgentInfo();
  const opts = {};
  if (sel.provider || sel.model) opts.provider = info.providerId;
  if (sel.model) opts.model = info.modelId;
  if (sel.effort && info.efforts.includes(sel.effort)) opts.effort = sel.effort;
  return opts;
}

const statusLabel = key => ({ done: t('done'), 'in-progress': t('inProgress'), planned: t('planned') })[key] || key || '';
const docStatusLabel = key => ({ confirmed: t('confirmed'), draft: t('draft') })[key] || key || '';
const ticketFilters = () => [
  ['all', t('all'), () => true],
  ['ready', t('ready'), x => x.ready],
  ['in-progress', t('inProgress'), x => x.status === 'in-progress'],
  ['done', t('done'), x => x.status === 'done'],
];

// The doc runtime posts `doc:*` messages; a project that carries an older runtime posts `lumzel:*`.
// Read both, and post both, so either runtime works.
const kindOf = type => (typeof type === 'string' ? /^(?:doc|lumzel):(.+)$/.exec(type)?.[1] : undefined);
function post(target, kind, payload = {}) {
  target?.postMessage({ type: `doc:${kind}`, ...payload }, '*');
  target?.postMessage({ type: `lumzel:${kind}`, ...payload }, '*');
}

// ---------- helpers

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
}

// In a market preview there is no Worktree: the pages come from the sample project this Deck ships.
const worktreeUrl = (path, { hash = '', query = '' } = {}) =>
  `${state.preview ? 'sample' : 'worktree'}/${path.split('/').map(encodeURIComponent).join('/')}?${query ? `${query}&` : ''}theme=${state.theme}${
    hash ? `#${hash}` : ''
  }`;

const feature = () => state.index.features.find(f => f.id === state.featureId);

function progress(f) {
  const all = f.tickets.length;
  const done = f.tickets.filter(t => t.status === 'done').length;
  const run = f.tickets.filter(t => t.status === 'in-progress').length;
  return { all, done, run };
}

let toastTimer = 0;
function toast(text, isError = false) {
  const box = $('toast');
  box.textContent = text;
  box.classList.toggle('err', isError);
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.hidden = true), 4000);
}

function note(text, isError = false) {
  const box = $('note');
  box.textContent = text;
  box.classList.toggle('err', isError);
  box.hidden = !text;
}

// One frame per slot; a slot keeps its frame while the src stays the same, so switching tabs never reloads.
const frames = new Map();
function frameIn(slot, container, src, title) {
  let frame = frames.get(slot);
  if (!frame || !frame.isConnected) {
    frame = el('iframe', { class: 'frame', title });
    frames.set(slot, frame);
  }
  if (frame.parentNode !== container) container.append(frame);
  if (frame.dataset.src !== src) {
    frame.dataset.src = src;
    frame.src = src;
  }
  return frame;
}
function reloadFrames() {
  for (const frame of frames.values()) if (frame.dataset.src) frame.src = frame.dataset.src;
}

// ---------- rail

function renderRail() {
  const { features, docs } = state.index;
  $('hub').classList.toggle('on', state.view === 'hub');
  $('hub-count').textContent = docs.length ? t('hubCount', { n: docs.length }) : 'docs/';
  $('feats').replaceChildren(
    ...features.map(f => {
      const p = progress(f);
      return el(
        'button',
        {
          type: 'button',
          class: `feat${state.view === 'feature' && f.id === state.featureId ? ' on' : ''}`,
          title: f.summary || f.title,
          onclick: () => openFeature(f.id),
        },
        el('b', {}, f.title || f.id),
        f.title && f.title !== f.id ? el('span', { class: 'fid' }, f.id) : null,
        el('small', {}, p.all ? t('ticketProgress', { done: p.done, all: p.all }) : t('noTicketsYet')),
        p.all
          ? el(
              'span',
              { class: 'fbar' },
              el('i', { style: `width:${(p.done / p.all) * 100}%` }),
              el('i', { class: 'run', style: `width:${(p.run / p.all) * 100}%` }),
            )
          : null,
      );
    }),
  );
}

// ---------- feature pane

function renderFeature() {
  const f = feature();
  if (!f) return;
  $('f-title').textContent = f.title || f.id;
  $('f-id').textContent = f.title && f.title !== f.id ? f.id : '';
  const status = $('f-status');
  status.textContent = docStatusLabel(f.status);
  status.dataset.status = f.status || '';
  $('f-summary').textContent = f.summary || '';
  $('t-count').textContent = f.tickets.length ? String(f.tickets.length) : '';

  const confirmed = f.status === 'confirmed';
  const ready = f.tickets.some(x => x.ready && x.status !== 'done');
  for (const button of document.querySelectorAll('.act')) {
    const act = button.dataset.act;
    const enabled = act === 'implement' ? ready : act === 'review' ? true : confirmed;
    button.disabled = !enabled;
    button.title = enabled ? t(`${act}Hint`) : t(act === 'implement' ? 'implementBlocked' : 'needsConfirmed');
  }

  if (state.tab === 'prototype' && !f.prototype) state.tab = 'design';
  for (const tab of document.querySelectorAll('.tab')) {
    const name = tab.dataset.tab;
    tab.classList.toggle('on', name === state.tab);
    tab.setAttribute('aria-selected', String(name === state.tab));
    tab.disabled = name === 'prototype' && !f.prototype;
    if (name === 'prototype') tab.title = f.prototype ? t('screens', { n: f.screens.length }) : t('noPrototype');
  }
  for (const body of document.querySelectorAll('[data-tab-body]'))
    body.classList.toggle('on', body.dataset.tabBody === state.tab);

  if (state.tab === 'design') frameIn('design', $('tab-design'), worktreeUrl(f.design), t('design'));
  if (state.tab === 'prototype' && f.prototype) renderPrototype(f);
  if (state.tab === 'tickets') renderTickets(f);
}

// The prototype runs embedded (?embed=1&bare=1): it shows one screen; the Deck draws the screen list.
function renderPrototype(f) {
  $('screens').replaceChildren(
    ...f.screens.map(screen =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: screen.id === state.screen ? 'on' : '',
          'aria-selected': String(screen.id === state.screen),
          onclick: () =>
            post(frames.get('prototype')?.contentWindow, 'show', { id: screen.id }),
        },
        screen.title,
      ),
    ),
  );
  frameIn('prototype', $('proto-frame'), worktreeUrl(f.prototype, { query: 'embed=1&bare=1' }), t('prototype'));
}

function ticketState(ticket, f) {
  if (ticket.status === 'done') return ['done', t('done')];
  if (ticket.status === 'in-progress') return ['in-progress', t('inProgress')];
  if (ticket.ready) return ['ready', t('ready')];
  const byPath = new Map(f.tickets.map(x => [x.path, x.n]));
  const waiting = ticket.blockedBy.filter(path => f.tickets.find(x => x.path === path)?.status !== 'done');
  return [
    'planned',
    waiting.length ? t('waitingFor', { list: waiting.map(path => byPath.get(path) || '?').join(', ') }) : t('planned'),
  ];
}

function renderTickets(f) {
  const open = state.ticket && f.tickets.find(x => x.path === state.ticket);
  $('tickets').hidden = Boolean(open);
  $('ticket-open').hidden = !open;
  if (open) {
    const [kind, label] = ticketState(open, f);
    $('ticket-back').replaceChildren(
      '← ',
      el('span', { class: `dot ${kind}` }),
      el('span', { class: 'mono' }, open.n),
      ` ${open.title} · ${label} · ${t('ticketTotal', { n: f.tickets.length })}`,
    );
    frameIn('ticket', $('ticket-open'), worktreeUrl(open.path), open.title);
    return;
  }
  if (!f.tickets.length) {
    $('filters').replaceChildren();
    $('rows').replaceChildren(
      el(
        'div',
        { class: 'empty' },
        f.status === 'confirmed' ? t('noTicketsConfirmed') : t('noTicketsDraft'),
      ),
    );
    return;
  }
  const filters = ticketFilters();
  $('filters').replaceChildren(
    ...filters.map(([key, label, match]) =>
      el(
        'button',
        { type: 'button', class: state.filter === key ? 'on' : '', onclick: () => ((state.filter = key), render()) },
        label,
        el('span', { class: 'count' }, String(f.tickets.filter(match).length)),
      ),
    ),
  );
  const match = (filters.find(([key]) => key === state.filter) || filters[0])[2];
  const rows = f.tickets.filter(match);
  $('rows').replaceChildren(
    ...(rows.length
      ? rows.map(row => {
          const [kind, label] = ticketState(row, f);
          return el(
            'button',
            { type: 'button', class: 'req', title: row.path, onclick: () => openTicket(row.path) },
            el('span', { class: `dot ${kind}`, title: statusLabel(row.status) }),
            el('span', { class: 't' }, el('span', { class: 'mono' }, row.n), row.title.replace(/^\d+\s+/, '')),
            el('span', { class: `state ${kind}` }, label),
          );
        })
      : [el('div', { class: 'empty' }, t('noTicketsInFilter'))]),
  );
}

// ---------- doc hub

function renderHub() {
  const { docs } = state.index;
  $('hub-sub').textContent = t('docCount', { n: docs.length });
  const open = state.hubDoc && docs.find(d => d.path === state.hubDoc);
  $('hub-body').hidden = Boolean(open);
  $('hub-doc').hidden = !open;
  if (open) {
    $('hub-back').textContent = `← ${t('hub')} · ${open.title}`;
    frameIn('hub', $('hub-doc'), worktreeUrl(open.path), open.title);
    return;
  }
  const group = (kind, label) => {
    const list = docs.filter(d => d.group === kind);
    if (!list.length) return null;
    return el(
      'section',
      { class: 'hub-group' },
      el('h4', {}, `${label} · ${list.length}`),
      el(
        'div',
        { class: 'cards' },
        list.map(d =>
          el(
            'button',
            { type: 'button', class: 'card', onclick: () => ((state.hubDoc = d.path), render()) },
            el(
              'span',
              { class: 'ct' },
              el('span', {}, d.title),
              d.status
                ? el('span', { class: 'pill', dataset: { status: d.status } }, docStatusLabel(d.status))
                : null,
            ),
            d.summary ? el('p', {}, d.summary) : null,
            el('small', {}, d.updated ? `${d.path} · ${d.updated}` : d.path),
          ),
        ),
      ),
    );
  };
  const groups = [group('design', t('design')), group('adr', 'ADR')].filter(Boolean);
  $('hub-body').replaceChildren(
    ...(groups.length ? groups : [el('div', { class: 'empty' }, t('hubEmpty'))]),
  );
}

// ---------- render

function setAgentPopOpen(open) {
  const pop = $('agent-pop');
  const btn = $('agent-btn');
  if (!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderTopbar() {
  const topbar = $('topbar');
  if (!topbar) return;
  const info = effectiveAgentInfo();
  const canSettings = typeof window.deck?.ui?.openSettings === 'function';
  const showTopbar = !state.preview && (info.agents.length > 0 || canSettings);
  topbar.hidden = !showTopbar;
  if (!showTopbar) {
    setAgentPopOpen(false);
    return;
  }

  const wrap = $('agent-wrap');
  const showAgent = info.agents.length > 0;
  wrap.hidden = !showAgent;
  if (!showAgent) {
    setAgentPopOpen(false);
  } else {
    const parts = [info.providerName, info.modelName, info.effort].filter(Boolean);
    $('agent-label').textContent = parts.join(' · ');
    $('agent-btn').classList.toggle('active', info.hasOverride);
    $('agent-badge').textContent = t(info.hasOverride ? 'agentBadgeCustom' : 'agentBadgeHost');
    $('agent-reset-btn').hidden = !info.hasOverride && !info.hasDeckDefaults;
    $('agent-save-default-btn').hidden = !info.hasOverride;
    $('agent-hint').textContent = t(info.hasOverride ? 'agentHintCustom' : 'agentHintHost');

    const agentSelect = $('agent-select');
    const hostName = info.hostAgent?.name || info.providerName;
    agentSelect.replaceChildren(
      el('option', { value: '' }, t('agentFollowHost', { name: hostName })),
      ...info.agents.map(a => el('option', { value: a.id }, a.name || a.id)),
    );
    agentSelect.value = state.agentOverride.provider || '';

    const modelSelect = $('agent-model-select');
    const defModelName = info.models.find(m => m.id === info.defaultModelId)?.name || info.defaultModelId || 'auto';
    modelSelect.replaceChildren(
      el('option', { value: '' }, t('agentFollowDefaultModel', { name: defModelName })),
      ...info.models.map(m => el('option', { value: m.id }, m.name || m.id)),
    );
    modelSelect.value = state.agentOverride.model || '';
    modelSelect.disabled = info.models.length === 0;

    const effortRow = $('agent-effort-row');
    const effortSelect = $('agent-effort-select');
    const hasEfforts = info.efforts.length > 0;
    effortRow.hidden = !hasEfforts;
    if (hasEfforts) {
      effortSelect.replaceChildren(
        el('option', { value: '' }, t('agentFollowDefaultEffort', { effort: info.defaultEffort || 'default' })),
        ...info.efforts.map(ef => el('option', { value: ef }, ef)),
      );
      effortSelect.value = state.agentOverride.effort || '';
    }
  }

  $('settings-btn').hidden = !canSettings;
}

function render() {
  const hasFeatures = state.index.features.length > 0;
  renderTopbar();
  renderRail();
  $('pane-hub').hidden = state.view !== 'hub';
  $('pane-feature').hidden = state.view !== 'feature' || !feature();
  $('pane-empty').hidden = state.view !== 'feature' || hasFeatures;
  if (state.view === 'hub') renderHub();
  else if (feature()) renderFeature();
}

function openFeature(id) {
  if (state.view === 'feature' && state.featureId === id) return;
  state.view = 'feature';
  state.featureId = id;
  state.ticket = '';
  state.filter = 'all';
  state.screen = '';
  $('intro').hidden = true;
  render();
}

function openTicket(path) {
  state.view = 'feature';
  state.tab = 'tickets';
  state.ticket = path;
  render();
}

// ---------- data

let loading = null;
let lastLoad = 0;
let defaultsSubscribed = false;
let paramsSubscribed = false;

function applyParamsValues(values) {
  if (!values || typeof values !== 'object') return;
  if (values.tddStrictness !== undefined) state.params.tddStrictness = String(values.tddStrictness || 'balanced');
  if (values.autoTickets !== undefined) state.params.autoTickets = Boolean(values.autoTickets);
  if (values.designRules !== undefined) state.params.designRules = String(values.designRules || '');
}

async function load({ reload = false } = {}) {
  if (loading) return loading;
  $('refresh').classList.add('spin');
  loading = (async () => {
    try {
      const [ctx, listed, catalogRes, paramsRes] = await Promise.all([
        deck.context(),
        deck.docs.index().catch(error => ({ error })),
        typeof deck.agent?.catalog === 'function' ? deck.agent.catalog().catch(() => null) : Promise.resolve(null),
        typeof deck.params?.get === 'function' ? deck.params.get().catch(() => null) : Promise.resolve(null),
      ]);
      state.preview = Boolean(ctx.preview);
      if (listed.error && !state.preview) throw listed.error;
      const index = state.preview ? SAMPLE_INDEX : listed;
      if (setLocale(ctx.locale)) applyI18n();
      if (ctx.theme !== state.theme) {
        state.theme = ctx.theme;
        document.documentElement.dataset.theme = ctx.theme;
        for (const frame of frames.values()) post(frame.contentWindow, 'theme', { theme: ctx.theme });
      }
      if (!state.preview) {
        if (catalogRes) {
          state.agentCatalog = catalogRes;
          state.agentOverride = sanitizeAgentSelection(state.agentOverride, catalogRes);
        }
        if (paramsRes?.values) applyParamsValues(paramsRes.values);
        if (!defaultsSubscribed && typeof deck.agent?.onDefaults === 'function') {
          defaultsSubscribed = true;
          deck.agent.onDefaults(async evt => {
            const nextDefaults = evt?.defaults || {
              provider: evt?.provider || '',
              model: evt?.model || '',
              effort: evt?.effort || '',
            };
            if (!state.agentCatalog && typeof deck.agent?.catalog === 'function') {
              state.agentCatalog = await deck.agent.catalog().catch(() => null);
            } else if (state.agentCatalog) {
              state.agentCatalog = { ...state.agentCatalog, defaults: nextDefaults };
            }
            state.agentOverride = sanitizeAgentSelection(state.agentOverride, state.agentCatalog);
            renderTopbar();
          });
        }
        if (!paramsSubscribed && typeof deck.params?.onChange === 'function') {
          paramsSubscribed = true;
          deck.params.onChange(evt => {
            if (evt?.values) applyParamsValues(evt.values);
          });
        }
      }
      state.index = index;
      if (!index.features.some(f => f.id === state.featureId)) state.featureId = index.features[0]?.id || '';
      note('');
      app.dataset.state = 'ready';
      render();
      if (reload) reloadFrames();
    } catch (error) {
      app.dataset.state = 'error';
      note(t('loadFailed', { reason: error.message }), true);
    } finally {
      lastLoad = Date.now();
      loading = null;
      $('refresh').classList.remove('spin');
    }
  })();
  return loading;
}

// Coming back to the drawer re-reads the index (Agents write docs meanwhile). No polling while hidden.
const freshen = () => {
  if (Date.now() - lastLoad > 2000) void load();
};
window.addEventListener('focus', freshen);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && freshen());

// ---------- frames talk back (the doc runtime and the prototype runtime)

window.addEventListener('message', event => {
  const data = event.data;
  const kind = kindOf(data?.type);
  if (!kind) return;
  const slot = [...frames.entries()].find(([, frame]) => frame.contentWindow === event.source)?.[0];
  if (!slot) return;
  const f = feature();
  // A design doc asks for its Trace: each Node a ticket delivers gets a ticket chip.
  if (kind === 'ready' && slot === 'design' && f) {
    const nodes = Object.fromEntries(Object.entries(f.nodeTickets).map(([id, list]) => [id, { t: list }]));
    const tickets = Object.fromEntries(f.tickets.map(x => [x.path, { n: x.n, title: x.title }]));
    post(event.source, 'trace', { trace: { nodes, tickets } });
  }
  if (kind === 'open-trace' && data.kind === 'ticket' && typeof data.path === 'string') openTicket(data.path);
  if (kind === 'screen' && slot === 'prototype' && typeof data.id === 'string') {
    state.screen = data.id;
    $('intro').textContent = data.intro || '';
    $('intro').hidden = !data.intro;
    if (f) renderPrototype(f);
  }
  // Alt+click in the prototype: show that design Node in the design tab.
  if (kind === 'open' && slot === 'prototype' && typeof data.url === 'string' && f) {
    const node = decodeURIComponent(data.url.split('#')[1] || '');
    state.tab = 'design';
    render();
    if (node) post(frames.get('design')?.contentWindow, 'show', { id: node });
  }
});

// ---------- agent actions

function buildPromptWithParams(skill, basePrompt) {
  const extras = [];
  if (
    (skill === 'spec-workbench-implement' || skill === 'spec-workbench-tdd') &&
    state.params.tddStrictness === 'strict'
  ) {
    extras.push('TDD enforcement: strict — always write a failing test before implementation.');
  } else if (
    (skill === 'spec-workbench-implement' || skill === 'spec-workbench-tdd') &&
    state.params.tddStrictness === 'relaxed'
  ) {
    extras.push('TDD enforcement: relaxed — verification tests may be added after implementation.');
  }
  if (skill === 'spec-workbench-grilling' && state.params.autoTickets) {
    extras.push('Once the design is confirmed, proceed directly to cutting tickets with spec-workbench-to-tickets.');
  }
  if (state.params.designRules.trim()) {
    extras.push(`Project rules: ${state.params.designRules.trim()}`);
  }
  return extras.length ? `${basePrompt}\n\n${extras.join('\n')}` : basePrompt;
}

async function run(skill, prompt, actionId) {
  if (state.preview) return toast(t('previewOnly'));
  try {
    const result = await deck.agent.run({
      skill,
      prompt: buildPromptWithParams(skill, prompt),
      actionId,
      ...agentRunOptions(),
    });
    toast(t(result.reused ? 'sessionFocused' : 'sessionOpened', { id: result.sessionId }));
  } catch (error) {
    toast(error.message, true);
  }
}

// Each header button opens a Session on one skill of this Deck. The prompt names paths, never file contents.
const ACTIONS = {
  tickets: f => ['spec-workbench-to-tickets', `Cut tickets for ${f.design} (Feature ${f.id} "${f.title}").`, 'cut-tickets'],
  prototype: f => ['spec-workbench-to-prototype', `Prototype ${f.design} (Feature ${f.id} "${f.title}").`, 'create-prototype'],
  implement: f => [
    'spec-workbench-implement',
    `Implement the next ready ticket of Feature ${f.id} "${f.title}" (tickets in docs/features/${f.id}/tickets/).`,
    'implement-next',
  ],
  review: f => [
    'spec-workbench-review',
    `Review the current changes against Feature ${f.id} "${f.title}" (${f.design}).`,
    'review-changes',
  ],
};

for (const button of document.querySelectorAll('.act')) {
  button.addEventListener('click', async () => {
    const f = feature();
    const action = ACTIONS[button.dataset.act];
    if (!f || !action) return;
    button.disabled = true;
    await run(...action(f));
    button.disabled = false;
  });
}

// ---------- new Feature

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const dialog = $('new-dialog');

function openNew() {
  $('new-err').textContent = '';
  dialog.hidden = false;
  $('new-id').focus();
}
function closeNew() {
  dialog.hidden = true;
}

async function submitNew() {
  const id = $('new-id').value.trim();
  const title = $('new-title').value.trim() || id;
  const brief = $('new-brief').value.trim();
  if (!ID_RE.test(id)) return ($('new-err').textContent = t('idInvalid'));
  if (state.index.features.some(f => f.id === id)) return ($('new-err').textContent = t('idTaken', { id }));
  $('new-ok').disabled = true;
  await run(
    'spec-workbench-grilling',
    [
      `New Feature ${id} "${title}".`,
      brief && `What it is for: ${brief}`,
      `Scaffold docs/features/${id}/design.html (spec-workbench-html: \`scaffold design ${id}\`) and set the doc's <title> and <h1> to "${title}".`,
    ]
      .filter(Boolean)
      .join('\n'),
    'create-feature',
  );
  $('new-ok').disabled = false;
  closeNew();
  for (const field of ['new-id', 'new-title', 'new-brief']) $(field).value = '';
}

// IME: an Enter that confirms a candidate never submits (composition end fires right before that keydown).
let composing = false;
let composedAt = 0;
dialog.addEventListener('compositionstart', () => (composing = true));
dialog.addEventListener('compositionend', () => {
  composing = false;
  composedAt = Date.now();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') return closeNew();
  if (event.key !== 'Enter' || event.shiftKey || event.target.tagName === 'TEXTAREA') return;
  if (composing || event.isComposing || event.keyCode === 229 || Date.now() - composedAt < 50) return;
  event.preventDefault();
  void submitNew();
});
dialog.addEventListener('click', event => event.target === dialog && closeNew());
$('new-ok').addEventListener('click', () => void submitNew());
$('new-cancel').addEventListener('click', closeNew);
$('new-feat').addEventListener('click', openNew);
$('empty-new').addEventListener('click', openNew);

// ---------- wiring

$('hub').addEventListener('click', () => {
  state.view = 'hub';
  state.hubDoc = '';
  render();
});
$('hub-back').addEventListener('click', () => ((state.hubDoc = ''), render()));
$('ticket-back').addEventListener('click', () => ((state.ticket = ''), render()));
$('refresh').addEventListener('click', () => void load({ reload: true }));
for (const tab of document.querySelectorAll('.tab'))
  tab.addEventListener('click', () => {
    if (tab.disabled) return;
    if (tab.dataset.tab === 'tickets' && state.tab === 'tickets') state.ticket = '';
    state.tab = tab.dataset.tab;
    render();
  });

$('agent-btn').addEventListener('click', e => {
  e.stopPropagation();
  setAgentPopOpen($('agent-pop').hidden);
});
document.addEventListener('click', e => {
  const pop = $('agent-pop');
  const wrap = $('agent-wrap');
  if (pop && !pop.hidden && wrap && !wrap.contains(e.target)) {
    setAgentPopOpen(false);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const pop = $('agent-pop');
    if (pop && !pop.hidden) setAgentPopOpen(false);
  }
});
$('agent-select').addEventListener('change', () => {
  state.agentOverride = sanitizeAgentSelection(
    { provider: $('agent-select').value, model: '', effort: '' },
    state.agentCatalog,
  );
  renderTopbar();
});
$('agent-model-select').addEventListener('change', () => {
  state.agentOverride = sanitizeAgentSelection(
    { ...state.agentOverride, model: $('agent-model-select').value, effort: '' },
    state.agentCatalog,
  );
  renderTopbar();
});
$('agent-effort-select').addEventListener('change', () => {
  state.agentOverride = sanitizeAgentSelection(
    { ...state.agentOverride, effort: $('agent-effort-select').value },
    state.agentCatalog,
  );
  renderTopbar();
});
$('agent-reset-btn').addEventListener('click', async () => {
  if (!state.preview && typeof window.deck?.agent?.resetDefaults === 'function') {
    try {
      const res = await window.deck.agent.resetDefaults();
      if (res?.defaults && state.agentCatalog) {
        state.agentCatalog = { ...state.agentCatalog, defaults: res.defaults };
      }
    } catch (error) {
      toast(error.message, true);
    }
  }
  state.agentOverride = { provider: '', model: '', effort: '' };
  renderTopbar();
});
$('agent-save-default-btn').addEventListener('click', async () => {
  if (state.preview) return toast(t('previewOnly'));
  const opts = agentRunOptions();
  if (!Object.keys(opts).length || typeof window.deck?.agent?.setDefaults !== 'function') return;
  try {
    const res = await window.deck.agent.setDefaults(opts);
    if (res?.defaults && state.agentCatalog) {
      state.agentCatalog = { ...state.agentCatalog, defaults: res.defaults };
    }
    state.agentOverride = { provider: '', model: '', effort: '' };
    renderTopbar();
    toast(t('agentSavedDefault'));
  } catch (error) {
    toast(error.message, true);
  }
});
$('settings-btn').addEventListener('click', () => {
  if (typeof window.deck?.ui?.openSettings === 'function') {
    window.deck.ui.openSettings().catch(error => toast(error.message, true));
  }
});

void load();
