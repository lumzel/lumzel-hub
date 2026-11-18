// Spec Workbench (spec-workbench): Manage Features (design, optional tickets, optional prototype)
// in reverse-chronological order with user-visible Lumzel sessions, live status buttons,
// in-Deck interactive Q&A (reusing open sessions or creating new ones with context),
// per-ticket & batch implementation, manual completion toggles, and feature/ticket review.
import { t, applyI18n, setLocale, getLocale } from './i18n.js';
import { getSampleData } from './sample.js';
import {
  applyDesignStatus,
  applyTicketDone,
  buildDesignReplyPrompt,
  buildTicketsReplyPrompt,
  deriveFeatureTitle,
  extractDocCreatedAttr,
  extractDocPendingIdAttr,
  featureTimeInfo,
  formatShortTime,
  generateFeatureId,
  isFallbackFeatureId,
  parseDesignDocQuestions,
  parseTicketChoices,
  reconcilePendingFeatureMatches,
  removeDesignTicketItem,
  sortFeaturesDesc,
  syncDesignTicketItem,
  todayIsoDate,
} from './docOps.js';
import {
  applyQaAnswerSelection,
  captureContainerScrollTop,
  draftStoreKey,
  hasQaDraftContent,
  mergeStoredQaDrafts,
  normalizeQaDraft,
  restoreContainerScrollTop,
  shouldAutoOpenQaPanel,
} from './qaUi.js';

const $ = id => document.getElementById(id);
const app = $('app');
applyI18n();

const ACTIVE_STATES = new Set(['running', 'needs_input']);
const TERMINAL_STATES = new Set(['done', 'idle', 'error', 'stopped', 'closed']);
const inFlightSlots = new Set();

const state = {
  index: { features: [], docs: [] },
  features: [], // merged & sorted features (pending + disk)
  featureMeta: {}, // id -> { id, title, brief, pending, createdAt, updatedAt, previousStatus, archived, archivedAt }
  ticketMeta: {}, // path -> { path, featureId, archived, archivedAt }
  fileMtimeMap: {}, // id -> max modifiedAt ms
  docCreatedMap: {}, // id -> raw data-doc-created attribute from design.html
  docCreatedCache: {}, // id -> { mtime, created }
  sortBy: 'created', // 'created' | 'updated'
  sessions: {}, // slotKey -> { slotKey, featureId, kind, ticketPath, sessionId, status, updatedAt }
  liveSessionStatus: {}, // featureId -> { designReusable, designSessionId, designStatus, ticketsReusable, ticketsSessionId, ticketsStatus }
  qaData: {}, // featureId -> { design: { open, settled, hasTicketsBlock }, ticketChoices: [...], nodeLabels: {...}, loadedKey }
  designDrafts: {}, // featureId -> { answers: { [id]: val }, note: '' }
  ticketDrafts: {}, // featureId -> { answers: { [key]: val }, note: '' }
  qaCollapsed: {}, // `${featureId}:design` | `${featureId}:tickets` -> boolean
  railCollapsed: false,
  archivedRailOpen: false,
  theme: 'light',
  preview: false,
  featureId: '',
  tab: 'design',
  filter: 'all',
  ticket: '',
  screen: '',
  protoLinking: false,
  pendingDesignNode: '',
  agentCatalog: null,
  agentOverride: { provider: '', model: '', effort: '' },
  params: { tddStrictness: 'balanced', autoTickets: false, designRules: '' },
};

// ---------- agent model selection

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

// ---------- helpers

const statusLabel = key => ({ done: t('done'), 'in-progress': t('inProgress'), planned: t('planned') })[key] || key || '';
const docStatusLabel = key =>
  ({ confirmed: t('confirmed'), draft: t('draft'), done: t('done'), pending: t('pendingStatus') })[key] || key || '';
const ticketFilters = () => [
  ['all', t('all'), () => true],
  ['ready', t('ready'), x => x.ready],
  ['in-progress', t('inProgress'), x => x.status === 'in-progress'],
  ['done', t('done'), x => x.status === 'done'],
];

const kindOf = type => (typeof type === 'string' ? /^(?:doc|lumzel):(.+)$/.exec(type)?.[1] : undefined);
function post(target, kind, payload = {}) {
  target?.postMessage({ type: `doc:${kind}`, ...payload }, '*');
  target?.postMessage({ type: `lumzel:${kind}`, ...payload }, '*');
}

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

const worktreeUrl = (path, { hash = '', query = '' } = {}) => {
  const locale = getLocale();
  const base = state.preview ? getSampleData(locale).prefix : 'worktree';
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}?${query ? `${query}&` : ''}theme=${state.theme}&lang=${locale}${
    hash ? `#${hash}` : ''
  }`;
};

const feature = () => state.features.find(f => f.id === state.featureId) || null;
const isFeatureArchived = id => Boolean(state.featureMeta[id]?.archived);
const isTicketArchived = path => Boolean(state.ticketMeta[path]?.archived);
const activeFeatureTickets = f => (f?.tickets || []).filter(x => !isTicketArchived(x.path));

function progress(f) {
  const tickets = activeFeatureTickets(f);
  const all = tickets.length;
  const done = tickets.filter(x => x.status === 'done').length;
  const run = tickets.filter(x => x.status === 'in-progress').length;
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

const frames = new Map();
function frameIn(slot, container, src, title) {
  let frame = frames.get(slot);
  if (!frame || !frame.isConnected) {
    frame = el('iframe', { class: 'frame', title });
    frames.set(slot, frame);
  }
  if (frame.parentNode !== container) container.replaceChildren(frame);
  if (frame.dataset.src !== src) {
    frame.dataset.ready = '';
    frame.dataset.src = src;
    frame.src = src;
  }
  return frame;
}
function dropFrame(slot) {
  const frame = frames.get(slot);
  if (frame) {
    frame.remove();
    frames.delete(slot);
  }
}
function reloadFrames() {
  for (const frame of frames.values()) {
    if (frame.isConnected && frame.dataset.src) {
      frame.dataset.ready = '';
      frame.src = frame.dataset.src;
    }
  }
}

// ---------- store & session helpers

const slotDesign = id => `design:${id}`;
const slotTickets = id => `tickets:${id}`;
const slotPrototype = id => `prototype:${id}`;
const slotImplement = id => `implement:${id}`;
const slotReview = id => `review:${id}`;
const slotTicketImplement = (id, path) => `ticketImplement:${id}:${path}`;
const slotTicketReview = (id, path) => `ticketReview:${id}:${path}`;

function canUseStore() {
  return !state.preview && typeof window.deck?.store?.put === 'function';
}

async function saveFeatureMeta(id, patch) {
  const prev = state.featureMeta[id] || { id };
  const next = { ...prev, ...patch, id };
  if (!next.docCreated) {
    const existingFeature =
      state.features.find(f => f.id === id) ||
      state.index?.features?.find(f => f.id === id);
    const snapshot =
      state.docCreatedMap[id] ||
      existingFeature?.created ||
      existingFeature?.updated ||
      '';
    if (snapshot) {
      next.docCreated = snapshot;
    }
  }
  state.featureMeta[id] = next;
  if (canUseStore()) {
    await window.deck.store.put('features', id, next).catch(() => {});
  }
  return next;
}

async function deleteFeatureMeta(id) {
  delete state.featureMeta[id];
  if (!state.preview && typeof window.deck?.store?.delete === 'function') {
    await window.deck.store.delete('features', id).catch(() => {});
  }
}

async function saveTicketMeta(path, patch) {
  const prev = state.ticketMeta[path] || { path };
  const next = { ...prev, ...patch, path };
  state.ticketMeta[path] = next;
  if (canUseStore()) {
    await window.deck.store.put('tickets', path, next).catch(() => {});
  }
  return next;
}

async function deleteTicketMeta(path) {
  delete state.ticketMeta[path];
  if (!state.preview && typeof window.deck?.store?.delete === 'function') {
    await window.deck.store.delete('tickets', path).catch(() => {});
  }
}

const QA_DRAFT_COLLECTION = 'qaDrafts';
const draftSaveTimers = new Map();
const dirtyDraftKeys = new Set();
const draftSeq = new Map();
const draftClearedAt = {};
let hasRestoredUiView = false;

function getDraftMap(kind) {
  return kind === 'tickets' ? state.ticketDrafts : state.designDrafts;
}

function ensureQaDraft(kind, featureId) {
  const map = getDraftMap(kind);
  if (!map[featureId]) {
    map[featureId] = { answers: {}, note: '', updatedAt: 0 };
  }
  return map[featureId];
}

function nextDraftTimestamp(prev = 0) {
  const now = Date.now();
  return now > prev ? now : prev + 1;
}

function saveUiView() {
  if (canUseStore()) {
    void window.deck.store
      .put('ui', 'view', {
        featureId: state.featureId || '',
        tab: state.tab || 'design',
        ticket: state.ticket || '',
      })
      .catch(() => {});
  }
}

async function persistQaDraftNow(kind, featureId) {
  if (!featureId) return;
  const storeKey = draftStoreKey(kind, featureId);
  const timer = draftSaveTimers.get(storeKey);
  if (timer) {
    clearTimeout(timer);
    draftSaveTimers.delete(storeKey);
  }
  const draft = getDraftMap(kind)[featureId];
  const seq = draftSeq.get(storeKey) || 0;

  try {
    if (!hasQaDraftContent(draft)) {
      draftClearedAt[storeKey] = nextDraftTimestamp(draftClearedAt[storeKey]);
      if (!state.preview && typeof window.deck?.store?.delete === 'function') {
        await window.deck.store.delete(QA_DRAFT_COLLECTION, storeKey).catch(() => {});
      }
    } else if (canUseStore()) {
      delete draftClearedAt[storeKey];
      const normalized = normalizeQaDraft(draft);
      const payload = {
        kind: kind === 'tickets' ? 'tickets' : 'design',
        featureId,
        answers: normalized.answers,
        note: normalized.note,
        updatedAt: normalized.updatedAt || Date.now(),
      };
      await window.deck.store.put(QA_DRAFT_COLLECTION, storeKey, payload).catch(() => {});
    }
  } finally {
    if ((draftSeq.get(storeKey) || 0) === seq) {
      dirtyDraftKeys.delete(storeKey);
    }
  }
}

function scheduleQaDraftSave(kind, featureId, { immediate = false } = {}) {
  if (!featureId) return;
  const draft = ensureQaDraft(kind, featureId);
  const storeKey = draftStoreKey(kind, featureId);
  draft.updatedAt = nextDraftTimestamp(Math.max(Number(draft.updatedAt) || 0, Number(draftClearedAt[storeKey]) || 0));
  delete draftClearedAt[storeKey];
  draftSeq.set(storeKey, (draftSeq.get(storeKey) || 0) + 1);
  dirtyDraftKeys.add(storeKey);

  const prevTimer = draftSaveTimers.get(storeKey);
  if (prevTimer) {
    clearTimeout(prevTimer);
    draftSaveTimers.delete(storeKey);
  }
  if (immediate) {
    void persistQaDraftNow(kind, featureId);
    return;
  }
  const timer = setTimeout(() => {
    draftSaveTimers.delete(storeKey);
    void persistQaDraftNow(kind, featureId);
  }, 150);
  draftSaveTimers.set(storeKey, timer);
}

function flushPendingQaDrafts() {
  for (const storeKey of [...draftSaveTimers.keys()]) {
    const sep = storeKey.indexOf(':');
    if (sep <= 0) continue;
    const kind = storeKey.slice(0, sep);
    const featureId = storeKey.slice(sep + 1);
    void persistQaDraftNow(kind, featureId);
  }
}

async function clearQaDraft(kind, featureId, { removeKey = false } = {}) {
  if (!featureId) return;
  const storeKey = draftStoreKey(kind, featureId);
  const timer = draftSaveTimers.get(storeKey);
  if (timer) {
    clearTimeout(timer);
    draftSaveTimers.delete(storeKey);
  }
  draftSeq.set(storeKey, (draftSeq.get(storeKey) || 0) + 1);
  dirtyDraftKeys.delete(storeKey);
  draftClearedAt[storeKey] = nextDraftTimestamp(draftClearedAt[storeKey]);

  const map = getDraftMap(kind);
  if (removeKey) delete map[featureId];
  else map[featureId] = { answers: {}, note: '', updatedAt: 0 };

  if (!state.preview && typeof window.deck?.store?.delete === 'function') {
    await window.deck.store.delete(QA_DRAFT_COLLECTION, storeKey).catch(() => {});
  }
}

function syncRailToggle() {
  const collapsed = Boolean(state.railCollapsed);
  app.classList.toggle('rail-collapsed', collapsed);
  const btn = $('rail-toggle');
  if (!btn) return;
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const label = t(collapsed ? 'expandRail' : 'collapseRail');
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

async function setRailCollapsed(collapsed) {
  state.railCollapsed = Boolean(collapsed);
  syncRailToggle();
  if (canUseStore()) {
    await window.deck.store.put('ui', 'railCollapsed', { collapsed: state.railCollapsed }).catch(() => {});
  }
}

function syncSortToggle() {
  const btn = $('sort-toggle');
  if (!btn) return;
  const isUpdated = state.sortBy === 'updated';
  btn.textContent = t(isUpdated ? 'sortUpdated' : 'sortCreated');
  btn.classList.toggle('is-updated', isUpdated);
  btn.setAttribute('aria-pressed', isUpdated ? 'true' : 'false');
  const modeLabel = t(isUpdated ? 'sortUpdatedLabel' : 'sortCreatedLabel');
  const hint = t('sortToggleHint', { mode: modeLabel });
  btn.title = hint;
  btn.setAttribute('aria-label', hint);
}

async function setSortBy(nextSort) {
  state.sortBy = nextSort === 'updated' ? 'updated' : 'created';
  state.features = sortFeaturesDesc(state.features, state.featureMeta, state.fileMtimeMap, {
    sortBy: state.sortBy,
    docCreatedMap: state.docCreatedMap,
  });
  render();
  if (canUseStore()) {
    await window.deck.store.put('ui', 'sortBy', { sortBy: state.sortBy }).catch(() => {});
  }
}

async function saveSessionRecord(record) {
  state.sessions[record.slotKey] = record;
  if (canUseStore()) {
    await window.deck.store.put('sessions', record.slotKey, record).catch(() => {});
  }
  return record;
}

async function deleteSessionRecord(slotKey) {
  delete state.sessions[slotKey];
  if (!state.preview && typeof window.deck?.store?.delete === 'function') {
    await window.deck.store.delete('sessions', slotKey).catch(() => {});
  }
}

function activeSessionForSlot(slotKey) {
  const rec = state.sessions[slotKey];
  if (!rec || !rec.sessionId) return null;
  return ACTIVE_STATES.has(rec.status) ? rec : null;
}

function activeTicketImplementSession(featureId) {
  return (
    Object.values(state.sessions).find(
      s =>
        s &&
        s.featureId === featureId &&
        s.kind === 'ticketImplement' &&
        s.sessionId &&
        ACTIVE_STATES.has(s.status),
    ) || null
  );
}

function hasAnyTicketImplementInFlight(featureId) {
  const prefix = `ticketImplement:${featureId}:`;
  for (const key of inFlightSlots) {
    if (key.startsWith(prefix)) return true;
  }
  return Boolean(activeTicketImplementSession(featureId));
}

function hasFeatureImplementBusy(featureId) {
  return Boolean(activeSessionForSlot(slotImplement(featureId)) || inFlightSlots.has(slotImplement(featureId)));
}

function activeSessionsForFeature(featureId) {
  return Object.values(state.sessions).filter(
    s => s && s.featureId === featureId && s.sessionId && ACTIVE_STATES.has(s.status),
  );
}

function allActiveSessions() {
  return Object.values(state.sessions).filter(s => s && s.sessionId && ACTIVE_STATES.has(s.status));
}

function recentSessionsForFeature(featureId) {
  return Object.values(state.sessions)
    .filter(s => s && s.featureId === featureId && s.sessionId && s.status !== 'closed')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 5);
}

function sessionKindLabel(kind) {
  return (
    {
      design: t('sessionChipDesign'),
      tickets: t('sessionChipTickets'),
      prototype: t('sessionChipPrototype'),
      implement: t('sessionChipImplement'),
      review: t('sessionChipReview'),
      ticketImplement: t('sessionChipImplement'),
      ticketReview: t('sessionChipReview'),
    }[kind] || kind
  );
}

async function openSession(sessionId) {
  if (!sessionId) return;
  if (state.preview) return toast(t('previewOnly'));
  try {
    if (typeof window.deck?.agent?.open === 'function') {
      await window.deck.agent.open(sessionId, { closeDeck: false });
    }
  } catch (error) {
    toast(error.message, true);
  }
}

function applyRunButtonState(btn, { slotKey, idleLabel, idleTitle, disabled = false, runningClass = 'running' }) {
  const active = activeSessionForSlot(slotKey);
  btn.classList.remove('running', 'needs-input');
  if (active) {
    const isWait = active.status === 'needs_input';
    btn.classList.add(isWait ? 'needs-input' : runningClass);
    btn.disabled = false;
    btn.title = t(isWait ? 'waitingOpenSession' : 'clickOpenSession');
    btn.replaceChildren(
      el('span', { class: `run-dot${isWait ? ' warn' : ''}`, 'aria-hidden': 'true' }),
      el('span', {}, isWait ? t('waitingInputBtn') : t('runningBtn')),
    );
    return active;
  }
  btn.disabled = disabled || inFlightSlots.has(slotKey);
  btn.title = idleTitle || '';
  btn.textContent = idleLabel;
  return null;
}

// ---------- doc reading & interactive Q&A parsing

function extractDesignNodeLabels(html) {
  const labels = {};
  if (typeof DOMParser !== 'function' || !html) return labels;
  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    for (const el of doc.querySelectorAll('[data-doc-node], [data-lumzel-node]')) {
      const id = el.getAttribute('data-doc-node') || el.getAttribute('data-lumzel-node');
      if (!id) continue;
      const lbl = el.querySelector('[data-doc-label], [data-lumzel-label]') || el;
      const text = String(lbl.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) labels[id] = text;
    }
  } catch {
    // ignore parse failure
  }
  return labels;
}

async function readDocText(path) {
  if (!path) return '';
  if (state.preview) {
    const sampleDocs = getSampleData(getLocale()).docs;
    if (path in sampleDocs) return sampleDocs[path];
    throw new Error(`Sample doc not bundled: ${path}`);
  }
  const res = await window.deck.files.read(path, { encoding: 'utf8' });
  return res?.content || '';
}

async function refreshFeatureQaData(f) {
  if (!f || f.pending || !f.design) return;
  const ticketSig = (f.tickets || []).map(x => `${x.path}:${x.status}`).join('|');
  const mtime = state.fileMtimeMap[f.id] || 0;
  const loadedKey = `${getLocale()}:${f.updated}:${mtime}:${f.status}:${ticketSig}`;
  if (state.qaData[f.id]?.loadedKey === loadedKey) return;

  try {
    const designHtml = await readDocText(f.design);
    const design = parseDesignDocQuestions(designHtml);
    const nodeLabels = extractDesignNodeLabels(designHtml);
    const ticketChoices = [];
    for (const tk of f.tickets || []) {
      try {
        const thtml = await readDocText(tk.path);
        const parsed = parseTicketChoices(thtml);
        for (const item of parsed.open) {
          ticketChoices.push({ ...item, ticketPath: tk.path, ticketTitle: tk.title, ticketN: tk.n });
        }
      } catch {
        // ignore single unreadable ticket
      }
    }
    state.qaData[f.id] = { design, ticketChoices, nodeLabels, loadedKey };
    if (f.id === state.featureId) {
      if (state.tab === 'design') renderDesignQa(f);
      if (state.tab === 'tickets') renderTicketsQa(f);
    }
  } catch {
    // non-fatal if doc cannot be read yet
  }
}

async function probeReusableSession(slotKey) {
  if (state.preview || typeof window.deck?.agent?.logs !== 'function') {
    return { reusable: false, sessionId: '', status: 'closed' };
  }
  const rec = state.sessions[slotKey];
  if (!rec?.sessionId) return { reusable: false, sessionId: '', status: 'closed' };
  try {
    const logs = await window.deck.agent.logs(rec.sessionId);
    const nextStatus = logs.exists ? logs.status : 'closed';
    if (nextStatus !== rec.status) {
      await saveSessionRecord({ ...rec, status: nextStatus, updatedAt: Date.now() });
    }
    return {
      reusable: Boolean(logs.exists && nextStatus !== 'closed' && !ACTIVE_STATES.has(nextStatus)),
      sessionId: rec.sessionId,
      status: nextStatus,
    };
  } catch {
    return { reusable: false, sessionId: rec.sessionId, status: 'closed' };
  }
}

async function refreshFeatureSessionHints(f) {
  if (!f || f.pending || state.preview) return;
  const [designProbe, ticketsProbe] = await Promise.all([
    probeReusableSession(slotDesign(f.id)),
    probeReusableSession(slotTickets(f.id)),
  ]);
  state.liveSessionStatus[f.id] = {
    designReusable: designProbe.reusable,
    designSessionId: designProbe.sessionId,
    designStatus: designProbe.status,
    ticketsReusable: ticketsProbe.reusable,
    ticketsSessionId: ticketsProbe.sessionId,
    ticketsStatus: ticketsProbe.status,
  };
  if (f.id === state.featureId) {
    if (state.tab === 'design') renderDesignQa(f);
    if (state.tab === 'tickets') renderTicketsQa(f);
    renderSessionStrip(f);
  }
}

// ---------- live session tracking

let agentSubscribed = false;
let reloadTimer = 0;
let pollTimer = 0;

function scheduleReload(reload = true) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    void load({ reload });
  }, 180);
}

function updateSessionStatusFromEvent(sessionId, nextStatus) {
  if (!sessionId || !nextStatus) return;
  let matched = false;
  let finishedNow = false;
  for (const [slotKey, rec] of Object.entries(state.sessions)) {
    if (rec?.sessionId !== sessionId) continue;
    matched = true;
    const wasActive = ACTIVE_STATES.has(rec.status);
    if (rec.status !== nextStatus) {
      const updated = { ...rec, status: nextStatus, updatedAt: Date.now() };
      state.sessions[slotKey] = updated;
      if (canUseStore()) void window.deck.store.put('sessions', slotKey, updated).catch(() => {});
    }
    if (wasActive && (!ACTIVE_STATES.has(nextStatus) || TERMINAL_STATES.has(nextStatus))) {
      finishedNow = true;
    }
  }
  if (matched) {
    syncActiveWatcher();
    renderRail();
    const cur = feature();
    if (cur?.pending) renderPendingPane();
    else if (cur) renderFeature();
  }
  if (finishedNow) {
    scheduleReload(true);
  }
}

function ensureAgentSubscriptions() {
  if (agentSubscribed || state.preview || !window.deck?.agent) return;
  agentSubscribed = true;
  if (typeof window.deck.agent.onState === 'function') {
    window.deck.agent.onState(evt => {
      if (evt?.sessionId && evt?.state) {
        updateSessionStatusFromEvent(evt.sessionId, evt.state);
      }
    });
  }
  if (typeof window.deck.agent.onEvent === 'function') {
    window.deck.agent.onEvent('*', evt => {
      if (evt?.sessionId && evt?.status) {
        updateSessionStatusFromEvent(evt.sessionId, evt.status);
      }
    });
  }
}

function syncActiveWatcher() {
  const hasActive = allActiveSessions().length > 0;
  if (hasActive && !pollTimer) {
    pollTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const activeList = allActiveSessions();
      if (!activeList.length) {
        clearInterval(pollTimer);
        pollTimer = 0;
        return;
      }
      if (typeof window.deck?.agent?.logs === 'function') {
        await Promise.all(
          activeList.map(async rec => {
            try {
              const logs = await window.deck.agent.logs(rec.sessionId);
              const status = logs.exists ? logs.status : 'closed';
              if (status !== rec.status) {
                updateSessionStatusFromEvent(rec.sessionId, status);
              }
            } catch {
              // ignore transient error
            }
          }),
        );
      }
      void load({ reload: false });
    }, 3000);
  } else if (!hasActive && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = 0;
  }
}

// ---------- rendering: rail & topbar

function buildFeatureRailItem(f, archived = false) {
  const p = progress(f);
  const activeRuns = activeSessionsForFeature(f.id);
  const hasWait = activeRuns.some(r => r.status === 'needs_input');
  const timeInfo = featureTimeInfo(f, state.featureMeta[f.id], state.fileMtimeMap[f.id] || 0, {
    sortBy: state.sortBy,
    docCreated: state.docCreatedMap[f.id] || '',
  });
  const timeText = formatShortTime(timeInfo.ms, f.updated, { hasTime: timeInfo.hasTime });
  const subText = f.pending
    ? t('pendingStatus')
    : p.all
      ? t('ticketProgress', { done: p.done, all: p.all })
      : t('noTicketsYet');

  return el(
    'button',
    {
      type: 'button',
      class: `feat${f.id === state.featureId ? ' on' : ''}${archived ? ' archived' : ''}`,
      title: f.summary || f.title || f.id,
      onclick: () => openFeature(f.id),
      oncontextmenu: e => openFeatureContextMenu(e, f),
    },
    el(
      'div',
      { class: 'feat-top' },
      activeRuns.length
        ? el('span', { class: `run-dot${hasWait ? ' warn' : ''}`, 'aria-hidden': 'true' })
        : null,
      el('b', {}, f.title || f.id),
    ),
    el(
      'div',
      { class: 'feat-meta' },
      el('span', { class: 'fid' }, f.id),
      timeText ? el('span', { class: 'ftime' }, timeText) : null,
    ),
    el(
      'div',
      { class: 'feat-sub' },
      el('small', {}, subText),
      el('span', { class: 'pill', dataset: { status: f.pending ? 'pending' : f.status } }, docStatusLabel(f.pending ? 'pending' : f.status)),
    ),
    p.all
      ? el(
          'span',
          { class: 'fbar' },
          el('i', { style: `width:${(p.done / p.all) * 100}%` }),
          el('i', { class: 'run', style: `width:${(p.run / p.all) * 100}%` }),
        )
      : null,
  );
}

function renderRail() {
  syncSortToggle();
  const active = [];
  const archived = [];
  for (const f of state.features) {
    if (!f.pending && isFeatureArchived(f.id)) archived.push(f);
    else active.push(f);
  }

  $('feats').replaceChildren(...active.map(f => buildFeatureRailItem(f, false)));

  const archivedRail = $('archived-rail');
  if (!archivedRail) return;
  if (!archived.length) {
    archivedRail.hidden = true;
    archivedRail.replaceChildren();
    return;
  }

  archivedRail.hidden = false;
  const toggleBtn = el(
    'button',
    {
      type: 'button',
      class: 'archived-toggle',
      'aria-expanded': state.archivedRailOpen ? 'true' : 'false',
      onclick: () => {
        state.archivedRailOpen = !state.archivedRailOpen;
        renderRail();
      },
    },
    `${state.archivedRailOpen ? '▾' : '▸'} ${t('archivedGroup', { n: archived.length })}`,
  );
  if (!state.archivedRailOpen) {
    archivedRail.replaceChildren(toggleBtn);
    return;
  }
  archivedRail.replaceChildren(
    toggleBtn,
    el('div', { class: 'archived-list' }, ...archived.map(f => buildFeatureRailItem(f, true))),
  );
}

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
  topbar.hidden = false;
  syncRailToggle();
  const info = effectiveAgentInfo();
  const canSettings = typeof window.deck?.ui?.openSettings === 'function';

  const wrap = $('agent-wrap');
  const showAgent = !state.preview && info.agents.length > 0;
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

  $('settings-btn').hidden = state.preview || !canSettings;
}

// ---------- rendering: feature pane & Q&A

function renderSessionStrip(f) {
  const strip = $('session-strip');
  if (!strip) return;
  const list = recentSessionsForFeature(f.id);
  strip.hidden = list.length === 0;
  if (!list.length) {
    strip.replaceChildren();
    return;
  }
  strip.replaceChildren(
    ...list.map(rec => {
      const active = ACTIVE_STATES.has(rec.status);
      const isWait = rec.status === 'needs_input';
      return el(
        'button',
        {
          type: 'button',
          class: `sess-chip ${rec.status || ''}`,
          title: t('viewSession'),
          onclick: () => void openSession(rec.sessionId),
        },
        active ? el('span', { class: `run-dot${isWait ? ' warn' : ''}`, 'aria-hidden': 'true' }) : null,
        `${sessionKindLabel(rec.kind)} · ${isWait ? t('waitingInputBtn') : active ? t('runningBtn') : t('viewSession')}`,
      );
    }),
  );
}

function renderFeature() {
  const f = feature();
  if (!f || f.pending) return;

  $('f-title').textContent = f.title || f.id;
  $('f-id').textContent = f.id;
  const statusEl = $('f-status');
  statusEl.textContent = docStatusLabel(f.status);
  statusEl.dataset.status = f.status || '';
  $('f-archived').hidden = !isFeatureArchived(f.id);
  const meta = state.featureMeta[f.id];
  const mtime = state.fileMtimeMap[f.id] || 0;
  const docCreated = state.docCreatedMap[f.id] || '';
  const curTime = featureTimeInfo(f, meta, mtime, { sortBy: state.sortBy, docCreated });
  const createdInfo = featureTimeInfo(f, meta, mtime, { sortBy: 'created', docCreated });
  const updatedInfo = featureTimeInfo(f, meta, mtime, { sortBy: 'updated', docCreated });
  $('f-time').textContent = formatShortTime(curTime.ms, f.updated, { hasTime: curTime.hasTime });
  const createdLabel = formatShortTime(createdInfo.ms, f.updated, { hasTime: createdInfo.hasTime });
  const updatedLabel = formatShortTime(updatedInfo.ms, f.updated, { hasTime: updatedInfo.hasTime });
  $('f-time').title = [
    createdLabel ? `${t('sortCreatedLabel')}: ${createdLabel}` : '',
    updatedLabel ? `${t('sortUpdatedLabel')}: ${updatedLabel}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  $('f-summary').textContent = f.summary || '';
  const activeTickets = activeFeatureTickets(f);
  $('t-count').textContent = activeTickets.length ? String(activeTickets.length) : '';

  const pTag = $('p-tag');
  if (f.prototype) {
    pTag.textContent = f.screens.length ? t('screens', { n: f.screens.length }) : t('prototypeReadyTag');
    pTag.classList.add('ready');
  } else {
    pTag.textContent = t('prototypeOptionalTag');
    pTag.classList.remove('ready');
  }

  // Header completion button
  const doneBtn = $('act-done');
  const isDone = f.status === 'done';
  doneBtn.classList.toggle('done-active', isDone);
  doneBtn.textContent = isDone ? t('reopenFeature') : t('markDone');
  doneBtn.title = isDone ? t('reopenHint') : t('markDoneHint');

  // Header action buttons (running buttons show "In Progress" & click opens Lumzel Session)
  const protoBtn = document.querySelector('.act[data-act="prototype"]');
  applyRunButtonState(protoBtn, {
    slotKey: slotPrototype(f.id),
    idleLabel: f.prototype ? t('prototypeUpdateAct') : t('prototypeAct'),
    idleTitle: t('prototypeHint'),
  });

  const ticketsBtn = document.querySelector('.act[data-act="tickets"]');
  applyRunButtonState(ticketsBtn, {
    slotKey: slotTickets(f.id),
    idleLabel: f.tickets.length ? t('ticketsRegenAct') : t('ticketsAct'),
    idleTitle: t('ticketsHint'),
  });

  const implBtn = document.querySelector('.act[data-act="implement"]');
  const unfinishedTickets = activeTickets.filter(x => x.status !== 'done').length;
  const hasTickets = f.tickets.length > 0;
  const ticketBusy = hasAnyTicketImplementInFlight(f.id);
  applyRunButtonState(implBtn, {
    slotKey: slotImplement(f.id),
    idleLabel: hasTickets ? t('implementAllAct') : t('implementDirectAct'),
    idleTitle: ticketBusy
      ? t('implementBatchBusy')
      : hasTickets
        ? t('implementAllHint')
        : t('implementDirectHint'),
    disabled: (hasTickets && unfinishedTickets === 0) || ticketBusy,
  });

  const reviewBtn = document.querySelector('.act[data-act="review"]');
  applyRunButtonState(reviewBtn, {
    slotKey: slotReview(f.id),
    idleLabel: t('reviewAct'),
    idleTitle: t('reviewHint'),
  });

  renderSessionStrip(f);

  // Tabs (all 3 always enabled — prototype & tickets are optional!)
  for (const tab of document.querySelectorAll('.tab')) {
    const name = tab.dataset.tab;
    tab.classList.toggle('on', name === state.tab);
    tab.setAttribute('aria-selected', String(name === state.tab));
    tab.disabled = false;
    if (name === 'prototype') {
      tab.title = f.prototype ? t('screens', { n: f.screens.length }) : t('noPrototype');
    }
  }
  for (const body of document.querySelectorAll('[data-tab-body]')) {
    body.classList.toggle('on', body.dataset.tabBody === state.tab);
  }

  if (state.tab === 'design') {
    renderDesignQa(f);
    frameIn('design', $('design-frame'), worktreeUrl(f.design), t('design'));
  }
  if (state.tab === 'tickets') {
    renderTickets(f);
  }
  if (state.tab === 'prototype') {
    renderPrototype(f);
  }
}

function qaSessionHint(slotKey, probedReusable, probedSessionId, probedStatus) {
  const rec = state.sessions[slotKey];
  const sessionId = rec?.sessionId || probedSessionId || '';
  const liveStatus = rec?.status || probedStatus || 'closed';
  if (liveStatus === 'needs_input' && sessionId) {
    return { text: t('qaWaitingInputHint', { id: sessionId }), reusable: false };
  }
  if (liveStatus === 'running' && sessionId) {
    return { text: t('qaRunningHint', { id: sessionId }), reusable: false };
  }
  if (probedReusable && sessionId) {
    return { text: t('qaReuseHint', { id: sessionId }), reusable: true };
  }
  if (sessionId) {
    return { text: t('qaNewContextHint'), reusable: false };
  }
  return { text: t('qaNoOpenSessionHint'), reusable: false };
}

function captureQaFocus(box) {
  const active = document.activeElement;
  if (!box || !active || !box.contains(active)) return null;
  const tag = active.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null;
  return {
    id: active.id || '',
    qaKey: active.dataset?.qaKey || '',
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function restoreQaFocus(box, saved) {
  if (!box || !saved) return;
  let target = null;
  if (saved.id) {
    target = document.getElementById(saved.id);
    if (target && !box.contains(target)) target = null;
  }
  if (!target && saved.qaKey) {
    for (const input of box.querySelectorAll('.qa-input')) {
      if (input.dataset?.qaKey === saved.qaKey) {
        target = input;
        break;
      }
    }
  }
  if (!target) return;
  try {
    target.focus({ preventScroll: true });
    if (saved.start !== null && saved.end !== null && typeof target.setSelectionRange === 'function') {
      target.setSelectionRange(saved.start, saved.end);
    }
  } catch {
    // ignore focus restoration failure
  }
}

function renderDesignQa(f) {
  const box = $('design-qa');
  if (!box) return;
  const prevScrollTop = captureContainerScrollTop(box, f.id, box.querySelector('.qa-body'));
  const prevFocus = captureQaFocus(box);
  const qa = state.qaData[f.id]?.design || { open: [], settled: [] };
  const openQuestions = qa.open || [];
  const collapseKey = `${f.id}:design`;
  const hasOpen = openQuestions.length > 0;
  const draft = ensureQaDraft('design', f.id);
  const explicitCollapsed = collapseKey in state.qaCollapsed ? state.qaCollapsed[collapseKey] : undefined;
  const isCollapsed = !shouldAutoOpenQaPanel({ hasOpen, draft, explicitCollapsed });

  const hintInfo = state.liveSessionStatus[f.id];
  const hint = qaSessionHint(
    slotDesign(f.id),
    hintInfo?.designReusable,
    hintInfo?.designSessionId,
    hintInfo?.designStatus,
  );
  const sessionHintText = hint.text;

  const sendBtn = el('button', {
    type: 'button',
    class: 'primary',
    id: 'design-qa-send',
    onclick: () => void submitDesignQa(f),
  });
  applyRunButtonState(sendBtn, {
    slotKey: slotDesign(f.id),
    idleLabel: t('qaSubmitDesign'),
    idleTitle: t('qaSubmitDesign'),
  });

  const head = el(
    'div',
    { class: 'qa-head' },
    el(
      'div',
      { class: 'qa-head-left' },
      el('strong', {}, hasOpen ? t('qaDesignOpenTitle', { n: openQuestions.length }) : t('qaDesignReplyTitle')),
      hasOpen ? el('span', { class: 'qa-badge' }, `${openQuestions.length}`) : null,
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'act sm',
        onclick: () => {
          state.qaCollapsed[collapseKey] = !isCollapsed;
          renderDesignQa(f);
        },
      },
      isCollapsed ? t('qaToggleShow') : t('qaToggleHide'),
    ),
  );

  if (isCollapsed) {
    box.replaceChildren(head);
    restoreContainerScrollTop(box, f.id, 0, null);
    return;
  }

  const questionCards = openQuestions.map(item => {
    const currentVal = draft.answers[item.id] ?? '';
    let itemEl = null;
    const inputEl = el('input', {
      type: 'text',
      class: 'qa-input',
      dataset: { qaKey: item.id },
      value: currentVal,
      placeholder: t('qaCustomPlaceholder'),
      oninput: e => {
        applyQaAnswerSelection({
          answers: draft.answers,
          answerKey: item.id,
          value: e.target.value,
          itemEl: itemEl || e.target.closest('.qa-item'),
        });
        scheduleQaDraftSave('design', f.id);
      },
      onblur: () => {
        if (dirtyDraftKeys.has(draftStoreKey('design', f.id))) {
          void persistQaDraftNow('design', f.id);
        }
      },
    });
    inputEl.value = currentVal;

    itemEl = el(
      'div',
      { class: 'qa-item' },
      el(
        'div',
        { class: 'qa-q' },
        el('span', {}, item.question),
        item.depends?.length ? el('span', { class: 'qa-ticket-tag' }, `← ${item.depends.join(', ')}`) : null,
      ),
      item.why ? el('p', { class: 'qa-why' }, item.why) : null,
      item.options?.length
        ? el(
            'div',
            { class: 'qa-opts' },
            ...item.options.map(opt =>
              el(
                'button',
                {
                  type: 'button',
                  class: `qa-opt${currentVal === opt.label ? ' on' : ''}`,
                  dataset: { optValue: opt.label },
                  onclick: e => {
                    applyQaAnswerSelection({
                      answers: draft.answers,
                      answerKey: item.id,
                      value: opt.label,
                      itemEl: itemEl || e.currentTarget.closest('.qa-item'),
                      inputEl,
                    });
                    scheduleQaDraftSave('design', f.id, { immediate: true });
                  },
                },
                opt.label,
                opt.recommended ? el('span', { class: 'qa-rec' }, t('qaRecommend')) : null,
              ),
            ),
          )
        : null,
      inputEl,
    );
    return itemEl;
  });

  const noteArea = el('textarea', {
    class: 'qa-note',
    id: 'design-qa-note',
    rows: 2,
    placeholder: t('qaDesignNotePlaceholder'),
    oninput: e => {
      draft.note = e.target.value;
      scheduleQaDraftSave('design', f.id);
    },
    onblur: () => {
      if (dirtyDraftKeys.has(draftStoreKey('design', f.id))) {
        void persistQaDraftNow('design', f.id);
      }
    },
  });
  noteArea.value = draft.note || '';

  const body = el(
    'div',
    { class: 'qa-body' },
    openQuestions.length ? el('div', { class: 'qa-list' }, ...questionCards) : null,
    noteArea,
    el(
      'div',
      { class: 'qa-foot' },
      el('span', { class: `qa-session-hint${hint.reusable ? ' reuse' : ''}` }, sessionHintText),
      el('div', { class: 'qa-foot-acts' }, sendBtn),
    ),
  );

  box.replaceChildren(head, body);
  restoreContainerScrollTop(box, f.id, prevScrollTop, body);
  restoreQaFocus(box, prevFocus);
}

function renderTicketsQa(f) {
  const box = $('tickets-qa');
  const toggleBtn = $('tickets-qa-toggle');
  if (!box || !toggleBtn) return;
  const ticketsEl = $('tickets');
  const prevScrollTop = captureContainerScrollTop(ticketsEl, f.id);
  const prevFocus = captureQaFocus(box);

  const choices = state.qaData[f.id]?.ticketChoices || [];
  const collapseKey = `${f.id}:tickets`;
  const hasOpen = choices.length > 0;
  const draft = ensureQaDraft('tickets', f.id);
  const explicitCollapsed = collapseKey in state.qaCollapsed ? state.qaCollapsed[collapseKey] : undefined;
  const isOpen = shouldAutoOpenQaPanel({ hasOpen, draft, explicitCollapsed });

  toggleBtn.textContent = hasOpen ? `${t('qaTicketsOpenTitle', { n: choices.length })}` : t('qaToggleShow');
  toggleBtn.classList.toggle('primary-soft', hasOpen);

  box.hidden = !isOpen;
  if (!isOpen) {
    box.replaceChildren();
    restoreContainerScrollTop(ticketsEl, f.id, prevScrollTop);
    return;
  }

  const hintInfo = state.liveSessionStatus[f.id];
  const hint = qaSessionHint(
    slotTickets(f.id),
    hintInfo?.ticketsReusable,
    hintInfo?.ticketsSessionId,
    hintInfo?.ticketsStatus,
  );
  const sessionHintText = hint.text;

  const sendBtn = el('button', {
    type: 'button',
    class: 'primary',
    id: 'tickets-qa-send',
    onclick: () => void submitTicketsQa(f),
  });
  applyRunButtonState(sendBtn, {
    slotKey: slotTickets(f.id),
    idleLabel: t('qaSubmitTickets'),
    idleTitle: t('qaSubmitTickets'),
  });

  const choiceCards = choices.map(item => {
    const key = `${item.ticketPath}::${item.id}`;
    const currentVal = draft.answers[key] ?? '';
    let itemEl = null;
    const inputEl = el('input', {
      type: 'text',
      class: 'qa-input',
      dataset: { qaKey: key },
      value: currentVal,
      placeholder: t('qaCustomPlaceholder'),
      oninput: e => {
        applyQaAnswerSelection({
          answers: draft.answers,
          answerKey: key,
          value: e.target.value,
          itemEl: itemEl || e.target.closest('.qa-item'),
        });
        scheduleQaDraftSave('tickets', f.id);
      },
      onblur: () => {
        if (dirtyDraftKeys.has(draftStoreKey('tickets', f.id))) {
          void persistQaDraftNow('tickets', f.id);
        }
      },
    });
    inputEl.value = currentVal;

    itemEl = el(
      'div',
      { class: 'qa-item' },
      el(
        'div',
        { class: 'qa-q' },
        el('span', { class: 'qa-ticket-tag' }, item.ticketN || item.ticketPath),
        el('span', {}, item.question),
      ),
      item.why ? el('p', { class: 'qa-why' }, item.why) : null,
      item.options?.length
        ? el(
            'div',
            { class: 'qa-opts' },
            ...item.options.map(opt =>
              el(
                'button',
                {
                  type: 'button',
                  class: `qa-opt${currentVal === opt.label ? ' on' : ''}`,
                  dataset: { optValue: opt.label },
                  onclick: e => {
                    applyQaAnswerSelection({
                      answers: draft.answers,
                      answerKey: key,
                      value: opt.label,
                      itemEl: itemEl || e.currentTarget.closest('.qa-item'),
                      inputEl,
                    });
                    scheduleQaDraftSave('tickets', f.id, { immediate: true });
                  },
                },
                opt.label,
                opt.recommended ? el('span', { class: 'qa-rec' }, t('qaRecommend')) : null,
              ),
            ),
          )
        : null,
      inputEl,
    );
    return itemEl;
  });

  const noteArea = el('textarea', {
    class: 'qa-note',
    id: 'tickets-qa-note',
    rows: 2,
    placeholder: t('qaTicketsNotePlaceholder'),
    oninput: e => {
      draft.note = e.target.value;
      scheduleQaDraftSave('tickets', f.id);
    },
    onblur: () => {
      if (dirtyDraftKeys.has(draftStoreKey('tickets', f.id))) {
        void persistQaDraftNow('tickets', f.id);
      }
    },
  });
  noteArea.value = draft.note || '';

  box.replaceChildren(
    el(
      'div',
      { class: 'qa-head' },
      el(
        'div',
        { class: 'qa-head-left' },
        el('strong', {}, hasOpen ? t('qaTicketsOpenTitle', { n: choices.length }) : t('qaTicketsReplyTitle')),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'act sm',
          onclick: () => {
            state.qaCollapsed[collapseKey] = true;
            renderTicketsQa(f);
          },
        },
        t('qaToggleHide'),
      ),
    ),
    el(
      'div',
      { class: 'qa-body' },
      choices.length ? el('div', { class: 'qa-list' }, ...choiceCards) : null,
      noteArea,
      el(
        'div',
        { class: 'qa-foot' },
        el('span', { class: `qa-session-hint${hint.reusable ? ' reuse' : ''}` }, sessionHintText),
        el('div', { class: 'qa-foot-acts' }, sendBtn),
      ),
    ),
  );
  restoreContainerScrollTop(ticketsEl, f.id, prevScrollTop);
  restoreQaFocus(box, prevFocus);
}

// ---------- rendering: tickets tab

function ticketState(ticket, f) {
  if (ticket.status === 'done') return ['done', t('done')];
  if (ticket.status === 'in-progress') return ['in-progress', t('inProgress')];
  if (ticket.ready) return ['ready', t('ready')];
  const byPath = new Map(f.tickets.map(x => [x.path, x.n]));
  const waiting = (ticket.blockedBy || []).filter(path => f.tickets.find(x => x.path === path)?.status !== 'done');
  return [
    'planned',
    waiting.length ? t('waitingFor', { list: waiting.map(path => byPath.get(path) || '?').join(', ') }) : t('planned'),
  ];
}

function blockedLabel(ticket, f) {
  const byPath = new Map(f.tickets.map(x => [x.path, x.n]));
  const waiting = (ticket.blockedBy || []).filter(path => f.tickets.find(x => x.path === path)?.status !== 'done');
  return waiting.map(p => byPath.get(p) || p).join(', ');
}

function renderTickets(f) {
  const allTickets = f.tickets || [];
  const open = state.ticket && allTickets.find(x => x.path === state.ticket);
  $('tickets').hidden = Boolean(open);
  $('ticket-open').hidden = !open;
  const featureImplBusy = hasFeatureImplementBusy(f.id);
  const ticketImplBusy = hasAnyTicketImplementInFlight(f.id);

  if (open) {
    const [kind, label] = ticketState(open, f);
    $('ticket-back').replaceChildren(
      '← ',
      el('span', { class: `dot ${kind}` }),
      el('span', { class: 'mono' }, open.n),
      ` ${open.title.replace(/^\d+\s+/, '')} · ${label} · ${t('ticketTotal', { n: allTickets.length })}`,
    );

    const implOneBtn = el('button', {
      type: 'button',
      class: 'act sm primary-soft',
      onclick: () => void runImplementTicket(f, open),
    });
    const waitList = blockedLabel(open, f);
    applyRunButtonState(implOneBtn, {
      slotKey: slotTicketImplement(f.id, open.path),
      idleLabel: t('implementOneAct'),
      idleTitle: featureImplBusy
        ? t('implementBatchBusy')
        : waitList
          ? t('blockedCannotImplement', { list: waitList })
          : t('implementOneHint'),
      disabled: open.status === 'done' || Boolean(waitList) || featureImplBusy,
    });

    const reviewOneBtn = el('button', {
      type: 'button',
      class: 'act sm',
      onclick: () => void runReviewTicket(f, open),
    });
    applyRunButtonState(reviewOneBtn, {
      slotKey: slotTicketReview(f.id, open.path),
      idleLabel: t('reviewTicketAct'),
      idleTitle: t('reviewTicketHint'),
    });

    const toggleDoneBtn = el(
      'button',
      {
        type: 'button',
        class: `act sm${open.status === 'done' ? ' done-active' : ''}`,
        onclick: () => void toggleTicketDone(f, open),
      },
      open.status === 'done' ? t('reopenTicket') : t('markDone'),
    );

    const moreOneBtn = el(
      'button',
      {
        type: 'button',
        class: 'ico more-btn sm',
        title: t('moreActions'),
        'aria-label': t('moreActions'),
        onclick: e => {
          e.stopPropagation();
          openTicketContextMenuFromButton(e.currentTarget, f, open);
        },
      },
      '⋯',
    );

    const ticketHead = $('ticket-open').querySelector('.ticket-head');
    if (ticketHead) {
      ticketHead.oncontextmenu = e => openTicketContextMenu(e, f, open);
    }

    $('ticket-head-acts').replaceChildren(
      isTicketArchived(open.path) ? el('span', { class: 'pill archived-pill' }, t('archivedPill')) : null,
      implOneBtn,
      reviewOneBtn,
      toggleDoneBtn,
      moreOneBtn,
    );
    frameIn('ticket', $('ticket-frame'), worktreeUrl(open.path), open.title);
    return;
  }

  dropFrame('ticket');
  const ticketsEl = $('tickets');
  const prevTicketsScrollTop = captureContainerScrollTop(ticketsEl, f.id);

  const activeTickets = allTickets.filter(x => !isTicketArchived(x.path));
  const archivedTickets = allTickets.filter(x => isTicketArchived(x.path));

  // Toolbar actions (operate on active tickets only)
  const hasReady = activeTickets.some(x => x.ready && x.status !== 'done');
  const hasUnfinished = activeTickets.some(x => x.status !== 'done');

  const nextBtn = $('tickets-next-btn');
  nextBtn.hidden = activeTickets.length === 0;
  applyRunButtonState(nextBtn, {
    slotKey: slotImplement(f.id),
    idleLabel: t('implementNextAct'),
    idleTitle: ticketImplBusy ? t('implementBatchBusy') : t('implementNextHint'),
    disabled: !hasReady || ticketImplBusy,
  });

  const allBtn = $('tickets-all-btn');
  allBtn.hidden = activeTickets.length === 0;
  applyRunButtonState(allBtn, {
    slotKey: slotImplement(f.id),
    idleLabel: t('implementAllAct'),
    idleTitle: ticketImplBusy ? t('implementBatchBusy') : t('implementAllHint'),
    disabled: !hasUnfinished || ticketImplBusy,
  });

  renderTicketsQa(f);

  if (!allTickets.length) {
    $('filters').replaceChildren();
    const genTicketsBtn = el('button', {
      type: 'button',
      class: 'act',
      onclick: () => void runFeatureAction(f, 'tickets'),
    });
    applyRunButtonState(genTicketsBtn, {
      slotKey: slotTickets(f.id),
      idleLabel: t('ticketsAct'),
      idleTitle: t('ticketsHint'),
    });

    const directImplBtn = el('button', {
      type: 'button',
      class: 'primary',
      onclick: () => void runFeatureAction(f, 'implement'),
    });
    applyRunButtonState(directImplBtn, {
      slotKey: slotImplement(f.id),
      idleLabel: t('implementDirectAct'),
      idleTitle: ticketImplBusy ? t('implementBatchBusy') : t('implementDirectHint'),
      disabled: ticketImplBusy,
    });

    $('rows').replaceChildren(
      el(
        'div',
        { class: 'empty-card', style: 'margin: 24px auto;' },
        el('div', { class: 'dia' }, '◈'),
        el('h2', {}, t('noTicketsTitle')),
        el('p', {}, t('noTicketsHint')),
        el('div', { class: 'empty-acts' }, directImplBtn, genTicketsBtn),
      ),
    );
    restoreContainerScrollTop(ticketsEl, f.id, prevTicketsScrollTop);
    return;
  }

  if (state.filter === 'archived' && archivedTickets.length === 0) {
    state.filter = 'all';
  }
  const filterGroups = ticketFilters().map(([key, label, match]) => [
    key,
    label,
    activeTickets.filter(match),
  ]);
  if (archivedTickets.length > 0) {
    filterGroups.push(['archived', t('archivedFilter'), archivedTickets]);
  }

  $('filters').replaceChildren(
    ...filterGroups.map(([key, label, matchedRows]) =>
      el(
        'button',
        { type: 'button', class: state.filter === key ? 'on' : '', onclick: () => ((state.filter = key), render()) },
        label,
        el('span', { class: 'count' }, String(matchedRows.length)),
      ),
    ),
  );

  const rows = (filterGroups.find(([key]) => key === state.filter) || filterGroups[0])[2];
  $('rows').replaceChildren(
    ...(rows.length
      ? rows.map(row => {
          const [kind, label] = ticketState(row, f);
          const waitList = blockedLabel(row, f);
          const archived = isTicketArchived(row.path);

          const implBtn = el('button', {
            type: 'button',
            class: 'act sm primary-soft',
            onclick: () => void runImplementTicket(f, row),
          });
          applyRunButtonState(implBtn, {
            slotKey: slotTicketImplement(f.id, row.path),
            idleLabel: t('implementOneAct'),
            idleTitle: featureImplBusy
              ? t('implementBatchBusy')
              : waitList
                ? t('blockedCannotImplement', { list: waitList })
                : t('implementOneHint'),
            disabled: row.status === 'done' || Boolean(waitList) || featureImplBusy,
          });

          const revBtn = el('button', {
            type: 'button',
            class: 'act sm',
            onclick: () => void runReviewTicket(f, row),
          });
          applyRunButtonState(revBtn, {
            slotKey: slotTicketReview(f.id, row.path),
            idleLabel: t('reviewTicketAct'),
            idleTitle: t('reviewTicketHint'),
          });

          const doneToggle = el(
            'button',
            {
              type: 'button',
              class: `act sm${row.status === 'done' ? ' done-active' : ''}`,
              title: row.status === 'done' ? t('reopenTicket') : t('markDone'),
              onclick: () => void toggleTicketDone(f, row),
            },
            row.status === 'done' ? t('reopenTicket') : t('markDone'),
          );

          const moreRowBtn = el(
            'button',
            {
              type: 'button',
              class: 'ico more-btn sm',
              title: t('moreActions'),
              'aria-label': t('moreActions'),
              onclick: e => {
                e.stopPropagation();
                openTicketContextMenuFromButton(e.currentTarget, f, row);
              },
            },
            '⋯',
          );

          return el(
            'div',
            {
              class: `req${archived ? ' archived' : ''}`,
              oncontextmenu: e => openTicketContextMenu(e, f, row),
            },
            el(
              'button',
              { type: 'button', class: 'req-main', title: row.path, onclick: () => openTicket(row.path) },
              el('span', { class: `dot ${kind}`, title: statusLabel(row.status) }),
              el('span', { class: 't' }, el('span', { class: 'mono' }, row.n), row.title.replace(/^\d+\s+/, '')),
              archived ? el('span', { class: 'pill archived-pill' }, t('archivedPill')) : null,
              el('span', { class: `state ${kind}` }, label),
            ),
            el('div', { class: 'req-actions' }, implBtn, revBtn, doneToggle, moreRowBtn),
          );
        })
      : [el('div', { class: 'empty' }, t('noTicketsInFilter'))]),
  );
  restoreContainerScrollTop(ticketsEl, f.id, prevTicketsScrollTop);
}

// ---------- rendering: prototype tab

function syncProtoLinkButton() {
  const linkBtn = $('proto-link-btn');
  if (!linkBtn) return;
  linkBtn.setAttribute('aria-pressed', String(state.protoLinking));
  linkBtn.classList.toggle('primary-soft', state.protoLinking);
}

function renderPrototype(f) {
  const hasProto = Boolean(f.prototype);
  $('proto-empty').hidden = hasProto;
  $('proto-ready').hidden = !hasProto;

  if (!hasProto) {
    state.protoLinking = false;
    dropFrame('prototype');
    const genBtn = $('proto-gen-btn');
    applyRunButtonState(genBtn, {
      slotKey: slotPrototype(f.id),
      idleLabel: t('protoGenNow'),
      idleTitle: t('prototypeHint'),
    });
    return;
  }

  $('screens').replaceChildren(
    ...f.screens.map(screen =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: screen.id === state.screen ? 'on' : '',
          'aria-selected': String(screen.id === state.screen),
          onclick: () => post(frames.get('prototype')?.contentWindow, 'show', { id: screen.id }),
        },
        screen.title,
      ),
    ),
  );

  syncProtoLinkButton();
  applyRunButtonState($('proto-regen-btn'), {
    slotKey: slotPrototype(f.id),
    idleLabel: t('prototypeUpdateAct'),
    idleTitle: t('prototypeHint'),
  });
  applyRunButtonState($('proto-review-btn'), {
    slotKey: slotReview(f.id),
    idleLabel: t('reviewProtoAct'),
    idleTitle: t('reviewHint'),
  });

  frameIn('prototype', $('proto-frame'), worktreeUrl(f.prototype, { query: 'embed=1&bare=1' }), t('prototype'));
}

// ---------- rendering: pending feature pane

function renderPendingPane() {
  const f = feature();
  if (!f || !f.pending) return;
  const designSess = state.sessions[slotDesign(f.id)];
  const active = designSess && ACTIVE_STATES.has(designSess.status);
  $('pending-id').textContent = f.id;
  $('pending-brief').textContent = f.summary || '';
  $('pending-spinner').classList.toggle('stopped', !active);
  $('pending-hint').textContent = active
    ? isFallbackFeatureId(f.id)
      ? t('pendingHintAuto')
      : t('pendingHint', { id: f.id })
    : t('pendingSessionStopped');
  const openBtn = $('pending-open-session');
  openBtn.hidden = !designSess?.sessionId;
  openBtn.textContent =
    designSess?.status === 'needs_input'
      ? `${t('waitingInputBtn')} · ${t('viewSession')}`
      : active
        ? `${t('runningBtn')} · ${t('viewSession')}`
        : t('viewSession');
  $('pending-remove').hidden = active;
}

// ---------- main render & navigation

function render() {
  const cur = feature();
  renderTopbar();
  renderRail();
  $('pane-feature').hidden = !cur || Boolean(cur.pending);
  $('pane-pending').hidden = !cur || !cur.pending;
  $('pane-empty').hidden = Boolean(cur);
  if (cur?.pending) renderPendingPane();
  else if (cur) renderFeature();
}

function openFeature(id) {
  const changed = state.featureId !== id;
  state.featureId = id;
  state.ticket = '';
  state.filter = 'all';
  state.screen = '';
  if (changed) {
    state.protoLinking = false;
    state.pendingDesignNode = '';
    dropFrame('design');
    dropFrame('ticket');
    dropFrame('prototype');
  }
  saveUiView();
  $('intro').hidden = true;
  render();
  const f = feature();
  if (f && !f.pending) {
    void refreshFeatureQaData(f);
    void refreshFeatureSessionHints(f);
  }
}

function openTicket(path) {
  state.tab = 'tickets';
  state.ticket = path;
  saveUiView();
  render();
}

// ---------- data loading

let loading = null;
let lastLoad = 0;
let defaultsSubscribed = false;
let paramsSubscribed = false;
let themeSubscribed = false;

function applyDeckTheme(nextTheme) {
  const theme = nextTheme === 'dark' ? 'dark' : 'light';
  if (theme === state.theme) return;
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  for (const frame of frames.values()) post(frame.contentWindow, 'theme', { theme });
}

function applyParamsValues(values) {
  if (!values || typeof values !== 'object') return;
  if (values.tddStrictness !== undefined) state.params.tddStrictness = String(values.tddStrictness || 'balanced');
  if (values.autoTickets !== undefined) state.params.autoTickets = Boolean(values.autoTickets);
  if (values.designRules !== undefined) state.params.designRules = String(values.designRules || '');
}

async function fetchFeatureMtimes(diskFeatures) {
  if (state.preview || typeof window.deck?.files?.list !== 'function') return {};
  const map = {};
  await Promise.all(
    diskFeatures.map(async f => {
      let maxTs = 0;
      try {
        const entries = await window.deck.files.list(`docs/features/${f.id}`);
        for (const e of entries) {
          if (e.modifiedAt && e.modifiedAt > maxTs) maxTs = e.modifiedAt;
        }
        if (f.tickets?.length) {
          const tEntries = await window.deck.files.list(`docs/features/${f.id}/tickets`).catch(() => []);
          for (const e of tEntries) {
            if (e.modifiedAt && e.modifiedAt > maxTs) maxTs = e.modifiedAt;
          }
        }
      } catch {
        // ignore if feature dir cannot be listed
      }
      if (maxTs > 0) map[f.id] = maxTs;
    }),
  );
  return map;
}

async function fetchFeatureDocMeta(diskFeatures, mtimeMap = {}) {
  if (!Array.isArray(diskFeatures) || diskFeatures.length === 0) return {};
  if (state.preview) {
    const sampleDocs = getSampleData(getLocale()).docs || {};
    const map = {};
    for (const f of diskFeatures) {
      const html = sampleDocs[f.design] || '';
      const created = extractDocCreatedAttr(html);
      const pendingId = extractDocPendingIdAttr(html);
      if (created || pendingId) map[f.id] = { created, pendingId };
    }
    return map;
  }
  if (typeof window.deck?.files?.read !== 'function') return {};
  const map = {};
  await Promise.all(
    diskFeatures.map(async f => {
      if (!f?.id || !f?.design) return;
      const mtime = Number(mtimeMap[f.id]) || 0;
      const cached = state.docCreatedCache[f.id];
      if (cached && mtime > 0 && cached.mtime === mtime) {
        if (cached.created || cached.pendingId) {
          map[f.id] = { created: cached.created || '', pendingId: cached.pendingId || '' };
        }
        return;
      }
      try {
        const res = await window.deck.files.read(f.design, { encoding: 'utf8' });
        const html = res?.content || '';
        const created = extractDocCreatedAttr(html);
        const pendingId = extractDocPendingIdAttr(html);
        state.docCreatedCache[f.id] = { mtime, created, pendingId };
        if (created || pendingId) map[f.id] = { created, pendingId };
      } catch {
        // ignore unreadable design doc
      }
    }),
  );
  return map;
}

async function syncStoreFromDisk(diskFeatures, docMetaMap = {}) {
  if (!canUseStore() || typeof window.deck?.store?.list !== 'function') return;
  const [metaEntries, ticketEntries, sessEntries, draftEntries, railPref, sortPref, viewPref] = await Promise.all([
    window.deck.store.list('features').catch(() => []),
    window.deck.store.list('tickets').catch(() => []),
    window.deck.store.list('sessions').catch(() => []),
    window.deck.store.list(QA_DRAFT_COLLECTION).catch(() => []),
    typeof window.deck?.store?.get === 'function'
      ? window.deck.store.get('ui', 'railCollapsed').catch(() => null)
      : Promise.resolve(null),
    typeof window.deck?.store?.get === 'function'
      ? window.deck.store.get('ui', 'sortBy').catch(() => null)
      : Promise.resolve(null),
    typeof window.deck?.store?.get === 'function'
      ? window.deck.store.get('ui', 'view').catch(() => null)
      : Promise.resolve(null),
  ]);

  const metaMap = {};
  for (const entry of metaEntries) {
    if (entry?.key && entry?.value) metaMap[entry.key] = entry.value;
  }
  const sessMap = {};
  for (const entry of sessEntries) {
    if (entry?.key && entry?.value) sessMap[entry.key] = entry.value;
  }

  const diskIds = new Set(diskFeatures.map(f => f.id));
  for (const [id, meta] of Object.entries(metaMap)) {
    if (meta.pending && diskIds.has(id)) {
      metaMap[id] = { ...meta, pending: false, updatedAt: Date.now() };
      void window.deck.store.put('features', id, metaMap[id]).catch(() => {});
    }
  }

  if (railPref && typeof railPref === 'object' && 'collapsed' in railPref) {
    state.railCollapsed = Boolean(railPref.collapsed);
  }
  if (sortPref && typeof sortPref === 'object' && (sortPref.sortBy === 'created' || sortPref.sortBy === 'updated')) {
    state.sortBy = sortPref.sortBy;
  }
  if (!hasRestoredUiView) {
    hasRestoredUiView = true;
    if (viewPref && typeof viewPref === 'object') {
      if (typeof viewPref.featureId === 'string' && viewPref.featureId && !state.featureId) {
        state.featureId = viewPref.featureId;
      }
      if (viewPref.tab === 'design' || viewPref.tab === 'tickets' || viewPref.tab === 'prototype') {
        state.tab = viewPref.tab;
      }
      if (typeof viewPref.ticket === 'string' && viewPref.ticket) {
        state.ticket = viewPref.ticket;
      }
    }
  }

  state.designDrafts = mergeStoredQaDrafts({
    memoryDrafts: state.designDrafts,
    entries: draftEntries,
    kind: 'design',
    dirtyKeys: dirtyDraftKeys,
    clearedAtMap: draftClearedAt,
  });
  state.ticketDrafts = mergeStoredQaDrafts({
    memoryDrafts: state.ticketDrafts,
    entries: draftEntries,
    kind: 'tickets',
    dirtyKeys: dirtyDraftKeys,
    clearedAtMap: draftClearedAt,
  });

  const pendingMatches = reconcilePendingFeatureMatches({
    diskFeatures,
    metaMap,
    docMetaMap,
    sessMap,
  });
  for (const { pendingId, finalId } of pendingMatches) {
    const prevMeta = metaMap[pendingId];
    if (prevMeta) {
      metaMap[finalId] = { ...prevMeta, id: finalId, pending: false, updatedAt: Date.now() };
      delete metaMap[pendingId];
      void window.deck.store.put('features', finalId, metaMap[finalId]).catch(() => {});
      if (typeof window.deck?.store?.delete === 'function') {
        void window.deck.store.delete('features', pendingId).catch(() => {});
      }
    }
    for (const [oldSlotKey, rec] of Object.entries(sessMap)) {
      if (!rec || rec.featureId !== pendingId) continue;
      const nextSlotKey =
        rec.kind === 'design' ? slotDesign(finalId) : oldSlotKey.replace(`:${pendingId}`, `:${finalId}`);
      const migratedRec = { ...rec, slotKey: nextSlotKey, featureId: finalId };
      if (!sessMap[nextSlotKey]) {
        sessMap[nextSlotKey] = migratedRec;
        void window.deck.store.put('sessions', nextSlotKey, migratedRec).catch(() => {});
      }
      if (oldSlotKey !== nextSlotKey) {
        delete sessMap[oldSlotKey];
        if (typeof window.deck?.store?.delete === 'function') {
          void window.deck.store.delete('sessions', oldSlotKey).catch(() => {});
        }
      }
    }
    if (inFlightSlots.has(slotDesign(pendingId))) {
      inFlightSlots.delete(slotDesign(pendingId));
      inFlightSlots.add(slotDesign(finalId));
    }
    for (const suffix of [':design', ':tickets']) {
      if (`${pendingId}${suffix}` in state.qaCollapsed) {
        state.qaCollapsed[`${finalId}${suffix}`] = state.qaCollapsed[`${pendingId}${suffix}`];
        delete state.qaCollapsed[`${pendingId}${suffix}`];
      }
    }
    for (const kind of ['design', 'tickets']) {
      const draftMap = getDraftMap(kind);
      if (draftMap[pendingId]) {
        if (!hasQaDraftContent(draftMap[finalId]) && hasQaDraftContent(draftMap[pendingId])) {
          draftMap[finalId] = draftMap[pendingId];
          scheduleQaDraftSave(kind, finalId, { immediate: true });
        }
        void clearQaDraft(kind, pendingId, { removeKey: true });
      }
    }
    if (state.featureId === pendingId) {
      state.featureId = finalId;
      saveUiView();
    }
  }

  state.featureMeta = metaMap;

  const ticketMap = {};
  for (const entry of ticketEntries) {
    if (entry?.key && entry?.value) ticketMap[entry.key] = entry.value;
  }
  state.ticketMeta = ticketMap;

  // Verify active sessions against live host session state
  if (typeof window.deck?.agent?.logs === 'function') {
    await Promise.all(
      Object.values(sessMap)
        .filter(s => s?.sessionId && ACTIVE_STATES.has(s.status))
        .map(async rec => {
          try {
            const logs = await window.deck.agent.logs(rec.sessionId);
            const liveStatus = logs.exists ? logs.status : 'closed';
            if (liveStatus !== rec.status) {
              const updated = { ...rec, status: liveStatus, updatedAt: Date.now() };
              sessMap[rec.slotKey] = updated;
              void window.deck.store.put('sessions', rec.slotKey, updated).catch(() => {});
            }
          } catch {
            // keep existing record
          }
        }),
    );
  }
  state.sessions = sessMap;
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
      if (setLocale(ctx.locale)) {
        applyI18n();
        for (const frame of frames.values()) {
          post(frame.contentWindow, 'locale', { locale: getLocale() });
        }
      }
      const index = state.preview ? getSampleData(getLocale()).index : listed;
      applyDeckTheme(ctx.theme);
      if (!themeSubscribed && typeof deck.ui?.onThemeChange === 'function') {
        themeSubscribed = true;
        deck.ui.onThemeChange(applyDeckTheme);
      }
      if (!state.preview) {
        ensureAgentSubscriptions();
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
        state.fileMtimeMap = await fetchFeatureMtimes(index.features || []);
      }
      const docMetaMap = await fetchFeatureDocMeta(index.features || [], state.fileMtimeMap);
      state.docCreatedMap = Object.fromEntries(
        Object.entries(docMetaMap)
          .filter(([, meta]) => meta.created)
          .map(([id, meta]) => [id, meta.created]),
      );
      if (!state.preview) {
        await syncStoreFromDisk(index.features || [], docMetaMap);
      }
      for (const [id, meta] of Object.entries(state.featureMeta)) {
        if (!state.docCreatedMap[id] && meta?.docCreated) {
          state.docCreatedMap[id] = meta.docCreated;
        }
      }

      const diskFeatures = index.features || [];
      const diskIds = new Set(diskFeatures.map(f => f.id));
      const pendingFeatures = Object.values(state.featureMeta)
        .filter(m => m.pending && !diskIds.has(m.id))
        .map(m => ({
          id: m.id,
          title: m.title || m.id,
          summary: m.brief || '',
          status: 'pending',
          updated: todayIsoDate(new Date(m.createdAt || Date.now())),
          design: `docs/features/${m.id}/design.html`,
          prototype: null,
          screens: [],
          tickets: [],
          nodeTickets: {},
          pending: true,
        }));

      state.index = index;
      state.features = sortFeaturesDesc([...diskFeatures, ...pendingFeatures], state.featureMeta, state.fileMtimeMap, {
        sortBy: state.sortBy,
        docCreatedMap: state.docCreatedMap,
      });

      if (!state.features.some(f => f.id === state.featureId)) {
        const activeFeatures = state.features.filter(f => f.pending || !isFeatureArchived(f.id));
        state.featureId = activeFeatures[0]?.id || '';
        state.tab = 'design';
        state.ticket = '';
      }
      const selected = feature();
      if (state.ticket && !selected?.tickets?.some(x => x.path === state.ticket)) {
        state.ticket = '';
      }

      note('');
      app.dataset.state = 'ready';
      syncActiveWatcher();
      render();

      const cur = feature();
      if (cur && !cur.pending) {
        void refreshFeatureQaData(cur);
        void refreshFeatureSessionHints(cur);
      }
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

const freshen = () => {
  if (Date.now() - lastLoad > 2000) void load();
};
window.addEventListener('focus', freshen);
window.addEventListener('blur', flushPendingQaDrafts);
window.addEventListener('pagehide', flushPendingQaDrafts);
window.addEventListener('beforeunload', flushPendingQaDrafts);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') freshen();
  else flushPendingQaDrafts();
});

// ---------- iframe message bridge

function buildPrototypeLabels(f) {
  const labels = {};
  const nodeLabels = state.qaData[f.id]?.nodeLabels || {};
  const ticketNumByPath = Object.fromEntries((f.tickets || []).map(x => [x.path, x.n]));
  const nodeIds = new Set([...Object.keys(nodeLabels), ...Object.keys(f.nodeTickets || {})]);
  for (const id of nodeIds) {
    const base = nodeLabels[id] || id;
    const nums = (f.nodeTickets?.[id] || []).map(p => ticketNumByPath[p]).filter(Boolean);
    labels[id] = nums.length ? `${base} · ${t('prototypeTicketRef', { list: nums.join(',') })}` : base;
  }
  return labels;
}

function jumpToDesignNode(node) {
  state.tab = 'design';
  state.pendingDesignNode = node || '';
  saveUiView();
  render();
  const designFrame = frames.get('design');
  if (node && designFrame?.dataset.ready === '1' && designFrame.contentWindow) {
    post(designFrame.contentWindow, 'show', { id: node });
    state.pendingDesignNode = '';
  }
}

window.addEventListener('message', event => {
  const data = event.data;
  const kind = kindOf(data?.type);
  if (!kind) return;
  const entry = [...frames.entries()].find(([, frame]) => frame.contentWindow === event.source);
  if (!entry) return;
  const [slot, frame] = entry;
  const f = feature();
  if (kind === 'ready') {
    frame.dataset.ready = '1';
    if (slot === 'design' && f && !f.pending) {
      const nodes = Object.fromEntries(Object.entries(f.nodeTickets || {}).map(([id, list]) => [id, { t: list }]));
      const tickets = Object.fromEntries((f.tickets || []).map(x => [x.path, { n: x.n, title: x.title }]));
      post(event.source, 'trace', { trace: { nodes, tickets } });
      if (state.pendingDesignNode) {
        post(event.source, 'show', { id: state.pendingDesignNode });
        state.pendingDesignNode = '';
      }
    } else if (slot === 'prototype' && f && !f.pending) {
      post(event.source, 'trace', { labels: buildPrototypeLabels(f) });
      if (state.protoLinking) {
        post(event.source, 'linking', { on: true });
      }
    }
  }
  if (kind === 'open-trace' && data.kind === 'ticket' && typeof data.path === 'string') openTicket(data.path);
  if (kind === 'screen' && slot === 'prototype' && typeof data.id === 'string') {
    state.screen = data.id;
    $('intro').textContent = data.intro || '';
    $('intro').hidden = !data.intro;
    if (f) renderPrototype(f);
  }
  if (kind === 'linking' && slot === 'prototype') {
    state.protoLinking = Boolean(data.on);
    syncProtoLinkButton();
  }
  if (kind === 'pick' && slot === 'prototype' && typeof data.ref === 'string' && f) {
    const node = data.ref.includes('#') ? data.ref.split('#')[1] : data.ref;
    if (node) jumpToDesignNode(node);
  }
  if (kind === 'open' && slot === 'prototype' && typeof data.url === 'string' && f) {
    const node = decodeURIComponent(data.url.split('#')[1] || '');
    jumpToDesignNode(node);
  }
});

// ---------- agent execution & session reuse

function buildPromptWithParams(skill, basePrompt, kind = '') {
  const extras = [];
  if (
    (skill === 'spec-workbench-implement' ||
      skill === 'spec-workbench-tdd' ||
      kind === 'implement' ||
      kind === 'ticketImplement') &&
    state.params.tddStrictness === 'strict'
  ) {
    extras.push('TDD enforcement: strict — always write a failing test before implementation.');
  } else if (
    (skill === 'spec-workbench-implement' ||
      skill === 'spec-workbench-tdd' ||
      kind === 'implement' ||
      kind === 'ticketImplement') &&
    state.params.tddStrictness === 'relaxed'
  ) {
    extras.push('TDD enforcement: relaxed — verification tests may be added after implementation.');
  }
  if ((skill === 'spec-workbench-grilling' || kind === 'design') && state.params.autoTickets) {
    extras.push(
      'Once all open decisions are answered, synthesize and confirm design.html with spec-workbench-to-design, and then proceed to cut tickets with spec-workbench-to-tickets.',
    );
  }
  if (state.params.designRules.trim()) {
    extras.push(`Project rules: ${state.params.designRules.trim()}`);
  }
  return extras.length ? `${basePrompt}\n\n${extras.join('\n')}` : basePrompt;
}

async function startTrackedRun({
  slotKey,
  featureId,
  kind,
  ticketPath = '',
  skill = '',
  prompt,
  actionId,
  sessionId = '',
}) {
  if (state.preview) {
    toast(t('previewOnly'));
    return null;
  }
  if (inFlightSlots.has(slotKey)) return null;
  inFlightSlots.add(slotKey);
  render();
  ensureAgentSubscriptions();
  const req = {
    prompt: buildPromptWithParams(skill, prompt, kind),
    skill: skill || '',
    actionId,
    wait: false,
    dedupe: 'none',
    focus: false,
    ...agentRunOptions(),
  };
  if (sessionId) req.sessionId = sessionId;

  try {
    const result = await deck.agent.run(req);
    await saveSessionRecord({
      slotKey,
      featureId,
      kind,
      ticketPath,
      sessionId: result.sessionId,
      status: result.status || 'running',
      updatedAt: Date.now(),
    });
    await saveFeatureMeta(featureId, { updatedAt: Date.now() });
    syncActiveWatcher();
    return result;
  } finally {
    inFlightSlots.delete(slotKey);
    render();
  }
}

async function sendToReusableSession({
  slotKey,
  featureId,
  kind,
  skill,
  actionId,
  buildPrompt,
}) {
  if (state.preview) {
    toast(t('previewOnly'));
    return null;
  }
  const existingId = state.sessions[slotKey]?.sessionId || '';
  if (existingId && typeof window.deck?.agent?.logs === 'function') {
    const logs = await window.deck.agent.logs(existingId).catch(() => ({ exists: false, status: 'closed' }));
    if (logs.exists && logs.status !== 'closed') {
      if (ACTIVE_STATES.has(logs.status)) {
        const prev = state.sessions[slotKey];
        if (prev && prev.status !== logs.status) {
          await saveSessionRecord({ ...prev, status: logs.status, updatedAt: Date.now() });
          render();
        }
        toast(t(logs.status === 'needs_input' ? 'waitingOpenSession' : 'sessionBusyToast', { id: existingId }));
        await openSession(existingId);
        return { busy: true, sessionId: existingId };
      }
      try {
        const res = await startTrackedRun({
          slotKey,
          featureId,
          kind,
          skill: '',
          prompt: buildPrompt(false),
          actionId,
          sessionId: existingId,
        });
        if (!res) return null;
        toast(t('sessionReplied', { id: res.sessionId }));
        return { reusedSession: true, result: res };
      } catch {
        // Session closed between check and send; fall through to create new session with full context
      }
    }
  }

  const res = await startTrackedRun({
    slotKey,
    featureId,
    kind,
    skill,
    prompt: buildPrompt(true),
    actionId,
  });
  if (!res) return null;
  toast(existingId ? t('sessionNewWithContext', { id: res.sessionId }) : t('sessionOpened', { id: res.sessionId }));
  return { reusedSession: false, result: res };
}

// ---------- feature & ticket actions

async function runFeatureAction(f, act) {
  if (!f || f.pending) return;
  if (state.preview) return toast(t('previewOnly'));

  const targetSlot =
    act === 'prototype'
      ? slotPrototype(f.id)
      : act === 'tickets'
        ? slotTickets(f.id)
        : act === 'implement'
          ? slotImplement(f.id)
          : slotReview(f.id);

  const active = activeSessionForSlot(targetSlot);
  if (active) {
    await openSession(active.sessionId);
    return;
  }
  if (act === 'implement' && hasAnyTicketImplementInFlight(f.id)) {
    const tkActive = activeTicketImplementSession(f.id);
    toast(t('implementBatchBusy'), true);
    if (tkActive) await openSession(tkActive.sessionId);
    return;
  }

  try {
    if (act === 'prototype') {
      const res = await startTrackedRun({
        slotKey: slotPrototype(f.id),
        featureId: f.id,
        kind: 'prototype',
        skill: 'spec-workbench-to-prototype',
        prompt: `Prototype ${f.design} (Feature ${f.id} "${f.title}").`,
        actionId: `prototype:${f.id}`,
      });
      if (res) toast(t('sessionOpened', { id: res.sessionId }));
    } else if (act === 'tickets') {
      const res = await startTrackedRun({
        slotKey: slotTickets(f.id),
        featureId: f.id,
        kind: 'tickets',
        skill: 'spec-workbench-to-tickets',
        prompt: `Cut tickets for ${f.design} (Feature ${f.id} "${f.title}").${f.prototype ? ` Prototype reference: ${f.prototype}.` : ''}`,
        actionId: `tickets:${f.id}`,
      });
      if (res) toast(t('sessionOpened', { id: res.sessionId }));
    } else if (act === 'implement') {
      const hasTickets = f.tickets.length > 0;
      const protoNote = f.prototype ? ` Reference prototype: ${f.prototype}.` : '';
      const archivedPaths = (f.tickets || []).filter(x => isTicketArchived(x.path)).map(x => x.path);
      const skipArchivedNote = archivedPaths.length ? ` Skip archived tickets: ${archivedPaths.join(', ')}.` : '';
      const prompt = hasTickets
        ? `all ${f.id}\n\nImplement all unfinished tickets of Feature ${f.id} "${f.title}" in dependency order: automatically split into one spec-workbench-builder subagent per ticket sequentially, and review each ticket result in the main Agent before moving to the next (plus a final end-to-end review). Tickets in docs/features/${f.id}/tickets/.${skipArchivedNote}${protoNote}`
        : `feature ${f.id}\n\nImplement Feature ${f.id} "${f.title}" directly from ${f.design} (tickets and prototype are optional), then review the result in the main Agent.${protoNote}`;
      const res = await startTrackedRun({
        slotKey: slotImplement(f.id),
        featureId: f.id,
        kind: 'implement',
        skill: 'spec-workbench-implement',
        prompt,
        actionId: `implement:${f.id}`,
      });
      if (res) toast(t('sessionOpened', { id: res.sessionId }));
    } else if (act === 'review') {
      const protoNote = f.prototype
        ? ` Also review ${f.prototype} against the design and implemented UI.`
        : '';
      const res = await startTrackedRun({
        slotKey: slotReview(f.id),
        featureId: f.id,
        kind: 'review',
        skill: 'spec-workbench-review',
        prompt: `Feature Review: Review Feature ${f.id} "${f.title}" (${f.design}${f.tickets.length ? `, tickets in docs/features/${f.id}/tickets/` : ''}${f.prototype ? `, prototype: ${f.prototype}` : ''}).${protoNote} Do NOT generate any docs/results/ file; return the structured review report directly.`,
        actionId: `review:${f.id}`,
      });
      if (res) toast(t('sessionOpened', { id: res.sessionId }));
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function runImplementNextTicket(f) {
  if (state.preview) return toast(t('previewOnly'));
  const active = activeSessionForSlot(slotImplement(f.id));
  if (active) return openSession(active.sessionId);
  if (hasAnyTicketImplementInFlight(f.id)) {
    const tkActive = activeTicketImplementSession(f.id);
    toast(t('implementBatchBusy'), true);
    if (tkActive) await openSession(tkActive.sessionId);
    return;
  }
  const protoNote = f.prototype ? ` Reference prototype: ${f.prototype}.` : '';
  const archivedPaths = (f.tickets || []).filter(x => isTicketArchived(x.path)).map(x => x.path);
  const skipArchivedNote = archivedPaths.length ? ` Skip archived tickets: ${archivedPaths.join(', ')}.` : '';
  try {
    const res = await startTrackedRun({
      slotKey: slotImplement(f.id),
      featureId: f.id,
      kind: 'implement',
      skill: 'spec-workbench-implement',
      prompt: `next\n\nImplement the next ready ticket of Feature ${f.id} "${f.title}" (tickets in docs/features/${f.id}/tickets/).${skipArchivedNote}${protoNote}`,
      actionId: `implement-next:${f.id}`,
    });
    if (res) toast(t('sessionOpened', { id: res.sessionId }));
  } catch (error) {
    toast(error.message, true);
  }
}

async function runImplementTicket(f, ticket) {
  if (state.preview) return toast(t('previewOnly'));
  const sKey = slotTicketImplement(f.id, ticket.path);
  const active = activeSessionForSlot(sKey);
  if (active) return openSession(active.sessionId);
  if (hasFeatureImplementBusy(f.id)) {
    const batchActive = activeSessionForSlot(slotImplement(f.id));
    toast(t('implementBatchBusy'), true);
    if (batchActive) await openSession(batchActive.sessionId);
    return;
  }
  const waitList = blockedLabel(ticket, f);
  if (waitList) return toast(t('blockedCannotImplement', { list: waitList }), true);
  const protoNote = f.prototype ? ` Reference prototype: ${f.prototype}.` : '';
  try {
    const res = await startTrackedRun({
      slotKey: sKey,
      featureId: f.id,
      kind: 'ticketImplement',
      ticketPath: ticket.path,
      skill: 'spec-workbench-implement',
      prompt: `${ticket.path}\n\nImplement ticket ${ticket.path} ("${ticket.title}") of Feature ${f.id} "${f.title}".${protoNote}`,
      actionId: `implement-ticket:${ticket.path}`,
    });
    if (res) toast(t('sessionOpened', { id: res.sessionId }));
  } catch (error) {
    toast(error.message, true);
  }
}

async function runReviewTicket(f, ticket) {
  if (state.preview) return toast(t('previewOnly'));
  const sKey = slotTicketReview(f.id, ticket.path);
  const active = activeSessionForSlot(sKey);
  if (active) return openSession(active.sessionId);
  const protoNote = f.prototype
    ? ` Also review ${f.prototype} if it covers screens/nodes delivered by this ticket.`
    : '';
  try {
    const res = await startTrackedRun({
      slotKey: sKey,
      featureId: f.id,
      kind: 'ticketReview',
      ticketPath: ticket.path,
      skill: 'spec-workbench-review',
      prompt: `Ticket Review: Review ticket ${ticket.path} ("${ticket.title}") of Feature ${f.id} "${f.title}" against ${f.design}.${protoNote} Do NOT generate any docs/results/ file; return the structured review report directly.`,
      actionId: `review-ticket:${ticket.path}`,
    });
    if (res) toast(t('sessionOpened', { id: res.sessionId }));
  } catch (error) {
    toast(error.message, true);
  }
}

async function toggleFeatureDone(f) {
  if (!f || f.pending) return;
  if (state.preview) return toast(t('previewOnly'));
  try {
    const res = await window.deck.files.read(f.design, { encoding: 'utf8' });
    const html = res?.content || '';
    const today = todayIsoDate();
    if (f.status === 'done') {
      const prev = state.featureMeta[f.id]?.previousStatus;
      let fallbackStatus = prev === 'draft' || prev === 'confirmed' ? prev : '';
      if (!fallbackStatus) {
        const parsed = parseDesignDocQuestions(html);
        fallbackStatus = parsed.open.length === 0 ? 'confirmed' : 'draft';
      }
      const nextHtml = applyDesignStatus(html, fallbackStatus, today);
      await window.deck.files.write(f.design, nextHtml, { encoding: 'utf8' });
      delete state.docCreatedCache[f.id];
      await saveFeatureMeta(f.id, { updatedAt: Date.now() });
      toast(t('reopenedFeature'));
    } else {
      await saveFeatureMeta(f.id, {
        previousStatus: f.status === 'draft' || f.status === 'confirmed' ? f.status : 'confirmed',
        updatedAt: Date.now(),
      });
      const nextHtml = applyDesignStatus(html, 'done', today);
      await window.deck.files.write(f.design, nextHtml, { encoding: 'utf8' });
      delete state.docCreatedCache[f.id];
      toast(t('markedFeatureDone'));
    }
    await load({ reload: true });
  } catch (error) {
    toast(t('writeDocFailed', { reason: error.message }), true);
  }
}

async function toggleTicketDone(f, ticket) {
  if (!f || !ticket) return;
  if (state.preview) return toast(t('previewOnly'));
  const markDone = ticket.status !== 'done';
  const today = todayIsoDate();
  try {
    const [ticketRes, designRes] = await Promise.all([
      window.deck.files.read(ticket.path, { encoding: 'utf8' }),
      window.deck.files.read(f.design, { encoding: 'utf8' }),
    ]);
    const nextTicketHtml = applyTicketDone(ticketRes?.content || '', markDone, today, {
      locale: getLocale(),
    });
    const nextDesignHtml = syncDesignTicketItem(
      designRes?.content || '',
      ticket.path,
      markDone ? 'done' : 'planned',
      today,
    );
    await Promise.all([
      window.deck.files.write(ticket.path, nextTicketHtml, { encoding: 'utf8' }),
      window.deck.files.write(f.design, nextDesignHtml, { encoding: 'utf8' }),
    ]);
    delete state.docCreatedCache[f.id];
    await saveFeatureMeta(f.id, { updatedAt: Date.now() });
    toast(t(markDone ? 'markedTicketDone' : 'reopenedTicket'));
    await load({ reload: true });
  } catch (error) {
    toast(t('writeDocFailed', { reason: error.message }), true);
  }
}

// ---------- Q&A submission handlers

async function submitDesignQa(f) {
  const sKey = slotDesign(f.id);
  const active = activeSessionForSlot(sKey);
  if (active) return openSession(active.sessionId);
  if (state.preview) return toast(t('previewOnly'));

  const qa = state.qaData[f.id]?.design || { open: [], settled: [] };
  const draft = state.designDrafts[f.id] || { answers: {}, note: '' };
  const answers = (qa.open || [])
    .map(q => ({ id: q.id, question: q.question, value: String(draft.answers[q.id] || '').trim() }))
    .filter(a => a.value);
  const noteText = String(draft.note || '').trim();
  if (!answers.length && !noteText) {
    return toast(t('qaNeedInput'), true);
  }

  try {
    const outcome = await sendToReusableSession({
      slotKey: sKey,
      featureId: f.id,
      kind: 'design',
      skill: 'spec-workbench-grilling',
      actionId: `design-reply:${f.id}`,
      buildPrompt: isNewSession =>
        buildDesignReplyPrompt({
          feature: f,
          answers,
          settled: qa.settled || [],
          note: noteText,
          isNewSession,
          locale: getLocale(),
        }),
    });
    if (outcome && !outcome.busy) {
      await clearQaDraft('design', f.id);
      renderDesignQa(f);
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function submitTicketsQa(f) {
  const sKey = slotTickets(f.id);
  const active = activeSessionForSlot(sKey);
  if (active) return openSession(active.sessionId);
  if (state.preview) return toast(t('previewOnly'));

  const choices = state.qaData[f.id]?.ticketChoices || [];
  const draft = state.ticketDrafts[f.id] || { answers: {}, note: '' };
  const answers = choices
    .map(c => ({
      ticketPath: c.ticketPath,
      id: c.id,
      question: c.question,
      value: String(draft.answers[`${c.ticketPath}::${c.id}`] || '').trim(),
    }))
    .filter(a => a.value);
  const noteText = String(draft.note || '').trim();
  if (!answers.length && !noteText) {
    return toast(t('qaNeedInput'), true);
  }

  try {
    const outcome = await sendToReusableSession({
      slotKey: sKey,
      featureId: f.id,
      kind: 'tickets',
      skill: 'spec-workbench-to-tickets',
      actionId: `tickets-reply:${f.id}`,
      buildPrompt: isNewSession =>
        buildTicketsReplyPrompt({
          feature: f,
          answers,
          tickets: f.tickets || [],
          note: noteText,
          isNewSession,
          locale: getLocale(),
        }),
    });
    if (outcome && !outcome.busy) {
      await clearQaDraft('tickets', f.id);
      renderTicketsQa(f);
    }
  } catch (error) {
    toast(error.message, true);
  }
}

// ---------- context menu, delete confirmation & archive/delete actions

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TICKET_PATH_RE = /^docs\/features\/[a-z0-9][a-z0-9-]*\/tickets\/[^/]+\.(?:html|lumzel(?:\.html)?)$/;

const ctxMenu = $('ctx-menu');
const confirmDialog = $('confirm-dialog');
let confirmAction = null;
let confirmBusy = false;

function closeContextMenu() {
  if (!ctxMenu || ctxMenu.hidden) return;
  ctxMenu.hidden = true;
  ctxMenu.replaceChildren();
}

function openContextMenu(clientX, clientY, items) {
  if (!ctxMenu || !items.length) return;
  closeContextMenu();
  ctxMenu.replaceChildren(
    ...items.map(item =>
      item.type === 'separator'
        ? el('div', { class: 'ctx-sep', role: 'separator' })
        : el(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              class: `ctx-item${item.danger ? ' danger-item' : ''}`,
              onclick: e => {
                e.stopPropagation();
                closeContextMenu();
                item.onSelect();
              },
            },
            item.label,
          ),
    ),
  );
  ctxMenu.style.left = '0px';
  ctxMenu.style.top = '0px';
  ctxMenu.hidden = false;
  const rect = ctxMenu.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
  ctxMenu.style.left = `${Math.max(8, Math.min(clientX, maxLeft))}px`;
  ctxMenu.style.top = `${Math.max(8, Math.min(clientY, maxTop))}px`;
}

function openContextMenuAnchored(anchor, items) {
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  openContextMenu(rect.right - 152, rect.bottom + 4, items);
}

function closeConfirmDialog(force = false) {
  if (!confirmDialog || (confirmBusy && !force)) return;
  confirmDialog.hidden = true;
  confirmAction = null;
}

function confirmDelete({ body, onConfirm }) {
  if (!confirmDialog) return;
  closeContextMenu();
  $('confirm-body').textContent = body;
  confirmAction = onConfirm;
  confirmBusy = false;
  $('confirm-ok').disabled = false;
  $('confirm-cancel').disabled = false;
  confirmDialog.hidden = false;
  $('confirm-cancel').focus();
}

async function archiveFeatureAction(f, archived) {
  if (!f || f.pending) return;
  if (state.preview) return toast(t('previewOnly'));
  await saveFeatureMeta(f.id, {
    archived: Boolean(archived),
    archivedAt: archived ? Date.now() : 0,
  });
  if (archived && state.featureId === f.id) {
    const nextActive = state.features.find(x => x.id !== f.id && (x.pending || !isFeatureArchived(x.id)));
    state.featureId = nextActive?.id || '';
    state.ticket = '';
    dropFrame('design');
    dropFrame('ticket');
    dropFrame('prototype');
    saveUiView();
  } else if (!archived && !state.featureId) {
    state.featureId = f.id;
    saveUiView();
  }
  toast(t(archived ? 'archivedFeature' : 'unarchivedFeature'));
  render();
  const cur = feature();
  if (cur && !cur.pending) {
    void refreshFeatureQaData(cur);
    void refreshFeatureSessionHints(cur);
  }
}

async function archiveTicketAction(f, ticket, archived) {
  if (!f || !ticket) return;
  if (state.preview) return toast(t('previewOnly'));
  await saveTicketMeta(ticket.path, {
    path: ticket.path,
    featureId: f.id,
    archived: Boolean(archived),
    archivedAt: archived ? Date.now() : 0,
  });
  if (archived && state.ticket === ticket.path) {
    state.ticket = '';
    dropFrame('ticket');
    saveUiView();
  }
  toast(t(archived ? 'archivedTicket' : 'unarchivedTicket'));
  render();
}

async function deleteFeatureAction(f) {
  if (!f) return;
  if (state.preview) return toast(t('previewOnly'));
  const activeRuns = activeSessionsForFeature(f.id);
  if (activeRuns.length && typeof window.deck?.agent?.stop === 'function') {
    await Promise.allSettled(activeRuns.map(rec => window.deck.agent.stop(rec.sessionId)));
  }

  if (!f.pending) {
    if (!ID_RE.test(f.id)) {
      throw new Error(t('idInvalid'));
    }
    if (typeof window.deck?.exec?.run !== 'function') {
      throw new Error('exec capability unavailable');
    }
    const res = await window.deck.exec.run('rm', ['-rf', `docs/features/${f.id}`]);
    if (!res || res.exitCode !== 0) {
      throw new Error(res?.stderr || res?.stdout || `rm exited with ${res?.exitCode ?? 'unknown'}`);
    }
  }

  const sessKeys = Object.entries(state.sessions)
    .filter(([, rec]) => rec?.featureId === f.id)
    .map(([key]) => key);
  await Promise.all(sessKeys.map(key => deleteSessionRecord(key)));

  const ticketPaths = Object.entries(state.ticketMeta)
    .filter(([path, meta]) => meta?.featureId === f.id || path.startsWith(`docs/features/${f.id}/`))
    .map(([path]) => path);
  await Promise.all(ticketPaths.map(path => deleteTicketMeta(path)));

  await deleteFeatureMeta(f.id);
  await Promise.all([
    clearQaDraft('design', f.id, { removeKey: true }),
    clearQaDraft('tickets', f.id, { removeKey: true }),
  ]);
  delete state.docCreatedMap[f.id];
  delete state.docCreatedCache[f.id];
  delete state.qaData[f.id];
  delete state.liveSessionStatus[f.id];
  delete state.qaCollapsed[`${f.id}:design`];
  delete state.qaCollapsed[`${f.id}:tickets`];

  if (state.featureId === f.id) {
    state.featureId = '';
    state.ticket = '';
    dropFrame('design');
    dropFrame('ticket');
    dropFrame('prototype');
    saveUiView();
  }
  syncActiveWatcher();
  toast(t('deletedFeature', { name: f.title || f.id }));
  await load({ reload: true });
}

async function deleteTicketAction(f, ticket) {
  if (!f || !ticket) return;
  if (state.preview) return toast(t('previewOnly'));
  if (!TICKET_PATH_RE.test(ticket.path) || ticket.path.includes('..')) {
    throw new Error(`Invalid ticket path: ${ticket.path}`);
  }
  if (typeof window.deck?.exec?.run !== 'function') {
    throw new Error('exec capability unavailable');
  }

  const relatedSlots = [slotTicketImplement(f.id, ticket.path), slotTicketReview(f.id, ticket.path)];
  if (typeof window.deck?.agent?.stop === 'function') {
    const activeIds = relatedSlots
      .map(key => activeSessionForSlot(key)?.sessionId)
      .filter(Boolean);
    if (activeIds.length) {
      await Promise.allSettled(activeIds.map(sid => window.deck.agent.stop(sid)));
    }
  }

  const res = await window.deck.exec.run('rm', ['-f', ticket.path]);
  if (!res || res.exitCode !== 0) {
    throw new Error(res?.stderr || res?.stdout || `rm exited with ${res?.exitCode ?? 'unknown'}`);
  }

  if (f.design) {
    try {
      const designRes = await window.deck.files.read(f.design, { encoding: 'utf8' });
      const nextDesignHtml = removeDesignTicketItem(designRes?.content || '', ticket.path, todayIsoDate());
      await window.deck.files.write(f.design, nextDesignHtml, { encoding: 'utf8' });
    } catch {
      // ignore if design.html cannot be updated
    }
  }

  await Promise.all(relatedSlots.map(key => deleteSessionRecord(key)));
  await deleteTicketMeta(ticket.path);
  delete state.qaData[f.id];

  if (state.ticket === ticket.path) {
    state.ticket = '';
    dropFrame('ticket');
    saveUiView();
  }
  syncActiveWatcher();
  toast(t('deletedTicket', { name: ticket.title || ticket.n || ticket.path }));
  await load({ reload: true });
}

function requestDeleteFeature(f) {
  if (!f) return;
  if (state.preview) return toast(t('previewOnly'));
  const name = f.title || f.id;
  confirmDelete({
    body: f.pending
      ? t('confirmDeletePendingBody', { name })
      : t('confirmDeleteFeatureBody', { name, id: f.id }),
    onConfirm: () => deleteFeatureAction(f),
  });
}

function requestDeleteTicket(f, ticket) {
  if (!f || !ticket) return;
  if (state.preview) return toast(t('previewOnly'));
  confirmDelete({
    body: t('confirmDeleteTicketBody', {
      name: ticket.title || ticket.n || ticket.path,
      path: ticket.path,
    }),
    onConfirm: () => deleteTicketAction(f, ticket),
  });
}

function buildFeatureMenuItems(f) {
  if (!f) return [];
  if (f.pending) {
    const items = [];
    const sessId = state.sessions[slotDesign(f.id)]?.sessionId;
    if (sessId) {
      items.push({ label: t('viewSession'), onSelect: () => void openSession(sessId) });
      items.push({ type: 'separator' });
    }
    items.push({ label: t('deleteFeature'), danger: true, onSelect: () => requestDeleteFeature(f) });
    return items;
  }
  const archived = isFeatureArchived(f.id);
  return [
    {
      label: t(archived ? 'unarchiveFeature' : 'archiveFeature'),
      onSelect: () => void archiveFeatureAction(f, !archived),
    },
    { type: 'separator' },
    {
      label: t('deleteFeature'),
      danger: true,
      onSelect: () => requestDeleteFeature(f),
    },
  ];
}

function buildTicketMenuItems(f, ticket) {
  if (!f || !ticket) return [];
  const archived = isTicketArchived(ticket.path);
  return [
    {
      label: t(archived ? 'unarchiveTicket' : 'archiveTicket'),
      onSelect: () => void archiveTicketAction(f, ticket, !archived),
    },
    { type: 'separator' },
    {
      label: t('deleteTicket'),
      danger: true,
      onSelect: () => requestDeleteTicket(f, ticket),
    },
  ];
}

function openFeatureContextMenu(event, f) {
  event.preventDefault();
  event.stopPropagation();
  openContextMenu(event.clientX, event.clientY, buildFeatureMenuItems(f));
}

function openFeatureContextMenuFromButton(anchor, f) {
  openContextMenuAnchored(anchor, buildFeatureMenuItems(f));
}

function openTicketContextMenu(event, f, ticket) {
  event.preventDefault();
  event.stopPropagation();
  openContextMenu(event.clientX, event.clientY, buildTicketMenuItems(f, ticket));
}

function openTicketContextMenuFromButton(anchor, f, ticket) {
  openContextMenuAnchored(anchor, buildTicketMenuItems(f, ticket));
}

// ---------- new Feature modal

const dialog = $('new-dialog');

function openNew() {
  closeContextMenu();
  $('new-err').textContent = '';
  dialog.hidden = false;
  $('new-brief').focus();
}

function closeNew() {
  dialog.hidden = true;
}

async function submitNew() {
  if (state.preview) return toast(t('previewOnly'));
  const brief = $('new-brief').value.trim();
  if (!brief) return ($('new-err').textContent = t('briefRequired'));

  const now = Date.now();
  const nowDate = new Date(now);
  const createdIso = nowDate.toISOString();
  const today = todayIsoDate(nowDate);
  const existingIds = state.features.map(f => f.id);
  const id = generateFeatureId(brief, existingIds, nowDate);
  const isFallback = isFallbackFeatureId(id);
  const title = deriveFeatureTitle(brief) || id;

  $('new-ok').disabled = true;
  try {
    await saveFeatureMeta(id, {
      id,
      title,
      brief,
      pending: true,
      createdAt: now,
      updatedAt: now,
      docCreated: createdIso,
      createdSource: 'ui',
    });
    const avoidIds = existingIds.slice(0, 40).join(', ');
    const avoidClause = avoidIds ? `, avoiding existing IDs: ${avoidIds}` : '';
    const promptLines = isFallback
      ? [
          `Temporary Pending ID: ${id} (placeholder only — do NOT use this timestamp id for the folder or doc id).`,
          `Derive a concise, semantic lowercase kebab-case Feature ID (2–4 English words matching ^[a-z][a-z0-9-]{1,31}$, e.g. "sae-logging-spec" or "invoice-redis-cache"${avoidClause}).`,
          `Requirement description:\n${brief}`,
          `Please automatically derive BOTH a concise, accurate Feature Name (for <title> and <h1>; do NOT copy the whole prompt verbatim) AND the semantic kebab-case Feature ID (<feature-id>). Follow spec-workbench-html to create docs/features/<feature-id>/design.html from scaffolds/design.html with data-doc-id="<feature-id>", data-doc-pending-id="${id}", data-doc-created="${createdIso}", and data-doc-date="${today}", updating .docid to <feature-id> and keeping the decision tree visible. Do NOT write any docs/results/ file.`,
        ]
      : [
          `Suggested Feature ID: ${id}`,
          `Use "${id}" or refine it to a cleaner 2–4 word lowercase kebab-case Feature ID matching ^[a-z][a-z0-9-]{1,31}$${avoidClause}.`,
          `Requirement description:\n${brief}`,
          `Please automatically derive a concise, accurate Feature Name (for <title> and <h1>; do NOT copy the whole prompt verbatim) and pick the final concise kebab-case Feature ID (<feature-id>, defaulting to "${id}" unless a cleaner slug fits better). Follow spec-workbench-html to create docs/features/<feature-id>/design.html from scaffolds/design.html with data-doc-id="<feature-id>", data-doc-pending-id="${id}", data-doc-created="${createdIso}", and data-doc-date="${today}", updating .docid to <feature-id> and keeping the decision tree visible. Do NOT write any docs/results/ file.`,
        ];
    const res = await startTrackedRun({
      slotKey: slotDesign(id),
      featureId: id,
      kind: 'design',
      skill: 'spec-workbench-grilling',
      prompt: promptLines.join('\n\n'),
      actionId: `create-feature:${id}`,
    });
    if (res) {
      toast(t('sessionOpened', { id: res.sessionId }));
      state.featureId = id;
      state.tab = 'design';
      state.ticket = '';
      saveUiView();
      closeNew();
      $('new-brief').value = '';
      await load({ reload: false });
    }
  } catch (error) {
    await deleteFeatureMeta(id);
    $('new-err').textContent = error.message;
  } finally {
    $('new-ok').disabled = false;
  }
}

let composing = false;
let composedAt = 0;
dialog.addEventListener('compositionstart', () => (composing = true));
dialog.addEventListener('compositionend', () => {
  composing = false;
  composedAt = Date.now();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') return closeNew();
  if (event.key !== 'Enter') return;
  if (event.target.tagName === 'TEXTAREA' && !event.metaKey && !event.ctrlKey) return;
  if (event.target.tagName !== 'TEXTAREA' && event.shiftKey) return;
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

$('sort-toggle')?.addEventListener('click', () => void setSortBy(state.sortBy === 'created' ? 'updated' : 'created'));
$('rail-toggle').addEventListener('click', () => void setRailCollapsed(!state.railCollapsed));
$('f-more').addEventListener('click', e => {
  e.stopPropagation();
  const f = feature();
  if (f) openFeatureContextMenuFromButton(e.currentTarget, f);
});
$('confirm-cancel').addEventListener('click', () => closeConfirmDialog());
confirmDialog.addEventListener('click', event => event.target === confirmDialog && closeConfirmDialog());
$('confirm-ok').addEventListener('click', async () => {
  if (confirmBusy || !confirmAction) return;
  const run = confirmAction;
  confirmBusy = true;
  $('confirm-ok').disabled = true;
  $('confirm-cancel').disabled = true;
  try {
    await run();
    closeConfirmDialog(true);
  } catch (error) {
    toast(t('deleteFailed', { reason: error.message }), true);
    closeConfirmDialog(true);
  } finally {
    confirmBusy = false;
    $('confirm-ok').disabled = false;
    $('confirm-cancel').disabled = false;
  }
});

document.addEventListener('pointerdown', e => {
  if (ctxMenu && !ctxMenu.hidden && !ctxMenu.contains(e.target)) {
    closeContextMenu();
  }
});
document.addEventListener('scroll', closeContextMenu, true);
window.addEventListener('blur', closeContextMenu);
window.addEventListener('resize', closeContextMenu);

for (const button of document.querySelectorAll('.act[data-act]')) {
  button.addEventListener('click', () => {
    const f = feature();
    if (f) void runFeatureAction(f, button.dataset.act);
  });
}
$('act-done').addEventListener('click', () => {
  const f = feature();
  if (f) void toggleFeatureDone(f);
});
$('tickets-next-btn').addEventListener('click', () => {
  const f = feature();
  if (f) void runImplementNextTicket(f);
});
$('tickets-all-btn').addEventListener('click', () => {
  const f = feature();
  if (f) void runFeatureAction(f, 'implement');
});
$('tickets-qa-toggle').addEventListener('click', () => {
  const f = feature();
  if (!f) return;
  const collapseKey = `${f.id}:tickets`;
  const choices = state.qaData[f.id]?.ticketChoices || [];
  const explicitCollapsed = collapseKey in state.qaCollapsed ? state.qaCollapsed[collapseKey] : undefined;
  const currentlyOpen = shouldAutoOpenQaPanel({
    hasOpen: choices.length > 0,
    draft: state.ticketDrafts[f.id],
    explicitCollapsed,
  });
  state.qaCollapsed[collapseKey] = currentlyOpen;
  renderTicketsQa(f);
});
$('proto-gen-btn').addEventListener('click', () => {
  const f = feature();
  if (f) void runFeatureAction(f, 'prototype');
});
$('proto-link-btn').addEventListener('click', () => {
  state.protoLinking = !state.protoLinking;
  syncProtoLinkButton();
  post(frames.get('prototype')?.contentWindow, 'linking', { on: state.protoLinking });
});
$('proto-regen-btn').addEventListener('click', () => {
  const f = feature();
  if (f) void runFeatureAction(f, 'prototype');
});
$('proto-review-btn').addEventListener('click', () => {
  const f = feature();
  if (f) void runFeatureAction(f, 'review');
});

$('pending-open-session').addEventListener('click', () => {
  const f = feature();
  const sess = f && state.sessions[slotDesign(f.id)];
  if (sess?.sessionId) void openSession(sess.sessionId);
});
$('pending-refresh').addEventListener('click', () => {
  flushPendingQaDrafts();
  void load({ reload: true });
});
$('pending-remove').addEventListener('click', () => {
  const f = feature();
  if (f?.pending) void deleteFeatureAction(f).catch(error => toast(t('deleteFailed', { reason: error.message }), true));
});

$('ticket-back').addEventListener('click', () => {
  state.ticket = '';
  saveUiView();
  render();
});
$('refresh').addEventListener('click', () => {
  flushPendingQaDrafts();
  void load({ reload: true });
});
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    if (tab.disabled) return;
    if (tab.dataset.tab === 'tickets' && state.tab === 'tickets') state.ticket = '';
    state.tab = tab.dataset.tab;
    saveUiView();
    render();
    const f = feature();
    if (f && !f.pending) {
      void refreshFeatureQaData(f);
      void refreshFeatureSessionHints(f);
    }
  });
}

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
    closeContextMenu();
    if (confirmDialog && !confirmDialog.hidden) closeConfirmDialog();
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
