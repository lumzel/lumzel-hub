// 方案工作台 (spec-workbench): Features (design, tickets, prototype) and the doc hub of the open Worktree,
// for any project. The list comes from deck.docs.index(); every page opens in a frame at worktree/<path>
// (read-only route). The Deck draws the frame (rail, tabs, ticket list); each doc renders itself with the
// Deck's own runtime (runtime/worktree.js, which Lumzel appends to every Worktree page the Deck frames).
import { t, applyI18n } from './i18n.js';
import { SAMPLE_INDEX } from './sample.js';

const $ = id => document.getElementById(id);
const app = $('app');

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
};

const STATUS = { done: t('done'), 'in-progress': t('inProgress'), planned: t('planned') };
const DOC_STATUS = { confirmed: t('confirmed'), draft: t('draft') };
const FILTERS = [
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
  status.textContent = DOC_STATUS[f.status] || f.status || '';
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
  $('filters').replaceChildren(
    ...FILTERS.map(([key, label, match]) =>
      el(
        'button',
        { type: 'button', class: state.filter === key ? 'on' : '', onclick: () => ((state.filter = key), render()) },
        label,
        el('span', { class: 'count' }, String(f.tickets.filter(match).length)),
      ),
    ),
  );
  const match = FILTERS.find(([key]) => key === state.filter)[2];
  const rows = f.tickets.filter(match);
  $('rows').replaceChildren(
    ...(rows.length
      ? rows.map(row => {
          const [kind, label] = ticketState(row, f);
          return el(
            'button',
            { type: 'button', class: 'req', title: row.path, onclick: () => openTicket(row.path) },
            el('span', { class: `dot ${kind}`, title: STATUS[row.status] || row.status }),
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
                ? el('span', { class: 'pill', dataset: { status: d.status } }, DOC_STATUS[d.status] || d.status)
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

function render() {
  const hasFeatures = state.index.features.length > 0;
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
async function load({ reload = false } = {}) {
  if (loading) return loading;
  $('refresh').classList.add('spin');
  loading = (async () => {
    try {
      const [ctx, listed] = await Promise.all([deck.context(), deck.docs.index().catch(error => ({ error }))]);
      state.preview = Boolean(ctx.preview);
      if (listed.error && !state.preview) throw listed.error;
      const index = state.preview ? SAMPLE_INDEX : listed;
      if (ctx.theme !== state.theme) {
        state.theme = ctx.theme;
        document.documentElement.dataset.theme = ctx.theme;
        for (const frame of frames.values()) post(frame.contentWindow, 'theme', { theme: ctx.theme });
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
  if (Date.now() - lastLoad > 2000) applyI18n();
void load();
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

async function run(skill, prompt, actionId) {
  if (state.preview) return toast(t('previewOnly'));
  try {
    const result = await deck.agent.run({ skill, prompt, actionId });
    toast(t('sessionOpened', { id: result.sessionId }));
  } catch (error) {
    toast(error.message, true);
  }
}

// Each header button opens a Session on one skill of this Deck. The prompt names paths, never file contents.
const ACTIONS = {
  tickets: f => ['deck-to-tickets', `Cut tickets for ${f.design} (Feature ${f.id} "${f.title}").`, 'cut-tickets'],
  prototype: f => ['deck-to-prototype', `Prototype ${f.design} (Feature ${f.id} "${f.title}").`, 'create-prototype'],
  implement: f => [
    'deck-implement',
    `Implement the next ready ticket of Feature ${f.id} "${f.title}" (tickets in docs/features/${f.id}/tickets/).`,
    'implement-next',
  ],
  review: f => [
    'deck-review',
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
    'deck-grilling',
    [
      `New Feature ${id} "${title}".`,
      brief && `What it is for: ${brief}`,
      `Scaffold docs/features/${id}/design.html (deck-html: \`scaffold design ${id}\`) and set the doc's <title> and <h1> to "${title}".`,
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

void load();
