// Lumzel GitHub Deck controller: gh CLI PR & Issue workflows + Lumzel Agent integration.
import { t, applyI18n, setLocale, getLocale } from './i18n.js';
import { getSampleData } from './sample.js';
import * as gh from './gh.js';
import {
  esc,
  formatRelTime,
  initials,
  summarizeChecks,
  prStatusInfo,
  issueStatusInfo,
  reviewDecisionInfo,
  renderLabelChip,
  renderMarkdown,
  parseUnifiedDiff,
  renderDiffFiles,
  renderChecksList,
} from './render.js';

const $ = id => document.getElementById(id);

const CACHE_KEY = 'github-deck:cache:v1';
const AGENT_KEY = 'github-deck:agent:v1';

const state = {
  preview: false,
  theme: 'light',
  params: { repo: '', defaultTab: 'prs', pageSize: '30', mergeMethod: 'squash' },
  env: null, // { viewer, repo, defaultBranch, repoUrl, branch, dirtyCount }
  envError: null,
  view: 'prs', // 'prs' | 'issues'
  prState: 'open',
  issueState: 'open',
  prFilter: 'all', // 'all' | 'mine' | 'review' | 'branch'
  issueFilter: 'all', // 'all' | 'mine' | 'assigned' | 'mentioned'
  search: '',
  prs: [],
  issues: [],
  selectedNumber: null,
  detailCache: new Map(), // `${view}:${number}` -> detail obj
  checksCache: new Map(), // number -> checks[]
  diffCache: new Map(), // number -> { diff, truncated }
  subtab: 'overview', // 'overview' | 'checks' | 'files'
  loadingList: false,
  loadingDetail: false,
  loadingDiff: false,
  railCollapsed: false,
  agentCatalog: null,
  agentOverride: { provider: '', model: '', effort: '' },
  sessions: {}, // `${view}:${number}` -> { sessionId, status, label }
  activeMenuOpen: false,
  composing: false,
};

let toastTimer = null;
let searchTimer = null;

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

function setSyncLabel(text) {
  const el = $('sync-label');
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function repoSlug() {
  return state.params.repo?.trim() || state.env?.repo || '';
}

function pageSize() {
  const n = Number(state.params.pageSize);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? n : 30;
}

function activeItems() {
  return state.view === 'prs' ? state.prs : state.issues;
}

function detailKey(view, number) {
  return `${view}:${number}`;
}

// ---------- Boot & Lifecycle

async function boot() {
  let ctx = { theme: 'light', locale: 'en', preview: false };
  try {
    if (window.deck?.context) {
      ctx = await window.deck.context();
    }
  } catch {
    // fallback to defaults
  }

  state.preview = Boolean(ctx.preview);
  state.theme = ctx.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  setLocale(ctx.locale || navigator.language || 'en');
  applyI18n();

  if (window.deck?.ui?.onThemeChange) {
    window.deck.ui.onThemeChange(theme => {
      state.theme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = state.theme;
    });
  }

  wireStaticEvents();

  if (state.preview) {
    loadPreviewMode();
    return;
  }

  // Load params
  try {
    if (window.deck?.params?.get) {
      const p = await window.deck.params.get();
      if (p && typeof p === 'object') Object.assign(state.params, p);
      if (state.params.defaultTab === 'issues') state.view = 'issues';
    }
    if (window.deck?.params?.onChange) {
      window.deck.params.onChange(p => {
        const prevRepo = state.params.repo;
        Object.assign(state.params, p || {});
        if (prevRepo !== state.params.repo) {
          state.detailCache.clear();
          state.checksCache.clear();
          state.diffCache.clear();
          refreshAll();
        }
      });
    }
  } catch {
    // ignore params failure
  }

  // Load Agent catalog & live events
  initAgentControls();

  // Hydrate SWR cache immediately before invoking gh CLI
  await hydrateCache();
  renderAll();

  // Live probe & refresh
  await refreshAll();
}

function loadPreviewMode() {
  const sample = getSampleData(getLocale());
  state.env = sample.env;
  state.prs = sample.prs;
  state.issues = sample.issues;
  for (const pr of sample.prs) {
    state.detailCache.set(detailKey('prs', pr.number), pr);
    state.checksCache.set(pr.number, pr.statusCheckRollup || []);
    state.diffCache.set(pr.number, { diff: pr.diff || '', truncated: false });
  }
  for (const iss of sample.issues) {
    state.detailCache.set(detailKey('issues', iss.number), iss);
  }
  state.selectedNumber = sample.prs[0]?.number ?? null;
  $('preview-banner').hidden = false;
  renderAll();
}

async function hydrateCache() {
  if (!window.deck?.store?.get) return;
  try {
    const cached = await window.deck.store.get(CACHE_KEY);
    if (cached && typeof cached === 'object') {
      if (cached.env) state.env = cached.env;
      if (Array.isArray(cached.prs)) state.prs = cached.prs;
      if (Array.isArray(cached.issues)) state.issues = cached.issues;
      const items = activeItems();
      if (items.length > 0 && state.selectedNumber == null) {
        state.selectedNumber = items[0].number;
      }
      if (state.prs.length > 0 || state.issues.length > 0) {
        setSyncLabel(t('cachedHint'));
      }
    }
  } catch {
    // ignore cache miss
  }
}

async function persistCache() {
  if (state.preview || !window.deck?.store?.put) return;
  try {
    await window.deck.store.put(CACHE_KEY, {
      env: state.env,
      prs: state.prs.slice(0, 50),
      issues: state.issues.slice(0, 50),
      savedAt: Date.now(),
    });
  } catch {
    // non-fatal
  }
}

// ---------- Data Loading

async function refreshAll() {
  if (state.preview) return;
  state.loadingList = true;
  state.envError = null;
  $('btn-refresh')?.classList.add('spinning');
  setSyncLabel(t('syncing'));

  try {
    state.env = await gh.probeEnvironment(state.params.repo || '');
    const slug = repoSlug();
    const [prs, issues] = await Promise.all([
      gh.listPrs({
        repo: slug,
        state: state.prState,
        filter: state.prFilter,
        search: state.view === 'prs' ? state.search : '',
        limit: pageSize(),
        branch: state.env.branch,
      }),
      gh.listIssues({
        repo: slug,
        state: state.issueState,
        filter: state.issueFilter,
        search: state.view === 'issues' ? state.search : '',
        limit: pageSize(),
      }),
    ]);
    state.prs = prs;
    state.issues = issues;
    await persistCache();

    const items = activeItems();
    if (state.selectedNumber == null || !items.some(x => x.number === state.selectedNumber)) {
      state.selectedNumber = items[0]?.number ?? null;
    }
    renderAll();
    if (state.selectedNumber != null) {
      await loadItemDetail(state.view, state.selectedNumber, { force: true });
    }
  } catch (err) {
    state.envError = err;
    renderAll();
  } finally {
    state.loadingList = false;
    $('btn-refresh')?.classList.remove('spinning');
    setSyncLabel('');
  }
}

async function refreshCurrentList() {
  if (state.preview) {
    renderList();
    return;
  }
  if (!state.env) {
    await refreshAll();
    return;
  }
  state.loadingList = true;
  setSyncLabel(t('syncing'));
  try {
    const slug = repoSlug();
    if (state.view === 'prs') {
      state.prs = await gh.listPrs({
        repo: slug,
        state: state.prState,
        filter: state.prFilter,
        search: state.search,
        limit: pageSize(),
        branch: state.env.branch,
      });
    } else {
      state.issues = await gh.listIssues({
        repo: slug,
        state: state.issueState,
        filter: state.issueFilter,
        search: state.search,
        limit: pageSize(),
      });
    }
    await persistCache();
    const items = activeItems();
    if (!items.some(x => x.number === state.selectedNumber)) {
      state.selectedNumber = items[0]?.number ?? null;
    }
    renderAll();
    if (state.selectedNumber != null) {
      await loadItemDetail(state.view, state.selectedNumber, { force: false });
    }
  } catch (err) {
    showToast(err?.message || 'Failed to load list');
  } finally {
    state.loadingList = false;
    setSyncLabel('');
  }
}

async function loadItemDetail(view, number, { force = false } = {}) {
  if (number == null || state.preview) return;
  const key = detailKey(view, number);
  if (!force && state.detailCache.has(key)) {
    renderDetail();
    return;
  }
  state.loadingDetail = true;
  renderDetail();
  try {
    const slug = repoSlug();
    if (view === 'prs') {
      const [detail, checks] = await Promise.all([
        gh.getPrDetail({ repo: slug, number }),
        gh.getPrChecks({ repo: slug, number }).catch(() => []),
      ]);
      if (detail) state.detailCache.set(key, detail);
      if (checks.length > 0) {
        state.checksCache.set(number, checks);
      } else if (Array.isArray(detail?.statusCheckRollup)) {
        state.checksCache.set(number, detail.statusCheckRollup);
      }
    } else {
      const detail = await gh.getIssueDetail({ repo: slug, number });
      if (detail) state.detailCache.set(key, detail);
    }
  } catch (err) {
    showToast(err?.message || 'Failed to load details');
  } finally {
    state.loadingDetail = false;
    renderDetail();
  }
}

async function ensureDiffLoaded(number) {
  if (state.preview || state.diffCache.has(number) || state.loadingDiff) return;
  state.loadingDiff = true;
  renderDetail();
  try {
    const res = await gh.getPrDiff({ repo: repoSlug(), number });
    state.diffCache.set(number, res);
  } catch (err) {
    state.diffCache.set(number, { diff: '', truncated: false, error: err?.message });
  } finally {
    state.loadingDiff = false;
    renderDetail();
  }
}

// ---------- Rendering

function renderAll() {
  renderTopbar();
  renderFilterControls();
  renderList();
  renderDetail();
}

function renderTopbar() {
  $('pr-count').textContent = String(state.prs.length);
  $('issue-count').textContent = String(state.issues.length);

  document.querySelectorAll('.seg-btn[data-view]').forEach(btn => {
    const active = btn.dataset.view === state.view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  const createBtn = $('btn-create');
  createBtn.textContent = state.view === 'prs' ? t('newPr') : t('newIssue');

  const pill = $('ctx-pill');
  if (state.env?.repo) {
    pill.hidden = false;
    $('ctx-repo').textContent = state.env.repo;
    const br = state.env.branch || '';
    $('ctx-branch').textContent = br;
    $('ctx-sep').hidden = !br;
    $('ctx-branch').hidden = !br;

    const branchPr = br ? state.prs.find(p => p.headRefName === br && p.state === 'OPEN') : null;
    const prLink = $('ctx-branch-pr');
    if (branchPr) {
      prLink.hidden = false;
      prLink.textContent = t('branchHasPr', { n: branchPr.number });
      prLink.dataset.prNumber = String(branchPr.number);
    } else {
      prLink.hidden = true;
    }
  } else {
    pill.hidden = true;
  }
}

function renderFilterControls() {
  const searchEl = $('search-input');
  searchEl.placeholder = state.view === 'prs' ? t('searchPlaceholderPr') : t('searchPlaceholderIssue');

  const sel = $('state-select');
  const mergedOpt = sel.querySelector('option[value="merged"]');
  if (mergedOpt) mergedOpt.hidden = state.view !== 'prs';
  sel.value = state.view === 'prs' ? state.prState : state.issueState;

  const chips =
    state.view === 'prs'
      ? [
          { id: 'all', label: t('filterAll') },
          { id: 'mine', label: t('filterMine') },
          { id: 'review', label: t('filterReview') },
          ...(state.env?.branch ? [{ id: 'branch', label: t('filterBranch') }] : []),
        ]
      : [
          { id: 'all', label: t('filterAll') },
          { id: 'mine', label: t('filterMine') },
          { id: 'assigned', label: t('filterAssigned') },
          { id: 'mentioned', label: t('filterMentioned') },
        ];
  const activeFilter = state.view === 'prs' ? state.prFilter : state.issueFilter;
  $('filter-chips').innerHTML = chips
    .map(c => `<button type="button" class="chip ${c.id === activeFilter ? 'active' : ''}" data-filter="${c.id}">${esc(c.label)}</button>`)
    .join('');
}

function filteredPreviewItems(items) {
  if (!state.preview) return items;
  const q = state.search.trim().toLowerCase();
  const st = state.view === 'prs' ? state.prState : state.issueState;
  const flt = state.view === 'prs' ? state.prFilter : state.issueFilter;
  return items.filter(item => {
    if (st !== 'all' && String(item.state || '').toLowerCase() !== st) return false;
    if (q && !`${item.title} #${item.number} ${item.author?.login || ''}`.toLowerCase().includes(q)) return false;
    if (flt === 'mine' && item.author?.login !== state.env?.viewer) return false;
    if (flt === 'branch' && item.headRefName !== state.env?.branch) return false;
    return true;
  });
}

function renderList() {
  const listEl = $('item-list');
  const items = filteredPreviewItems(activeItems());
  if (items.length === 0) {
    listEl.innerHTML = `<p class="empty-inline" style="padding:12px">${esc(
      state.view === 'prs' ? t('emptyPrList') : t('emptyIssueList'),
    )}</p>`;
    return;
  }

  listEl.innerHTML = items
    .map(item => {
      const selected = item.number === state.selectedNumber;
      const stInfo = state.view === 'prs' ? prStatusInfo(item) : issueStatusInfo(item);
      const author = item.author?.login || 'ghost';
      const rel = formatRelTime(item.updatedAt || item.createdAt);
      const checks = state.view === 'prs' ? summarizeChecks(item.statusCheckRollup) : null;
      const rev = state.view === 'prs' ? reviewDecisionInfo(item.reviewDecision) : null;
      const commentCount = Array.isArray(item.comments)
        ? item.comments.length
        : typeof item.comments?.totalCount === 'number'
          ? item.comments.totalCount
          : 0;

      return `
        <button type="button" class="list-row ${selected ? 'selected' : ''}" data-number="${item.number}">
          <div class="row-top">
            <span class="sdot ${stInfo.cls}" title="${esc(stInfo.label)}"></span>
            <span class="row-title">${esc(item.title)}</span>
          </div>
          <div class="row-meta">
            <span class="row-num mono">#${item.number}</span>
            <span>${esc(author)}</span>
            <span>${esc(rel)}</span>
            <span class="row-badges">
              ${checks && checks.tone !== 'none' ? `<span class="check-dot ${checks.tone}" title="${esc(checks.tone)}"></span>` : ''}
              ${rev ? `<span class="mono" style="color:var(--${rev.cls})">${rev.cls === 'done' ? '✓' : rev.cls === 'drift' ? '!' : '•'}</span>` : ''}
              ${commentCount > 0 ? `<span class="mono">💬${commentCount}</span>` : ''}
            </span>
          </div>
        </button>
      `;
    })
    .join('');
}

function renderEnvError() {
  const err = state.envError;
  const code = err?.code || 'CLI_ERROR';
  let title = t('envNotRepoTitle');
  let desc = err?.message || t('envNotRepoDesc');
  let cmd = '';

  if (code === 'GH_NOT_FOUND') {
    title = t('envGhMissingTitle');
    desc = t('envGhMissingDesc');
    cmd = 'brew install gh && gh auth login';
  } else if (code === 'GH_NOT_AUTHED') {
    title = t('envGhAuthTitle');
    desc = t('envGhAuthDesc');
    cmd = 'gh auth login';
  } else if (code === 'NOT_GITHUB_REPO') {
    title = t('envNotRepoTitle');
    desc = t('envNotRepoDesc');
  } else if (code === 'PERMISSION_DENIED') {
    title = t('envPermTitle');
    desc = t('envPermDesc');
  }

  $('env-error').innerHTML = `
    <h3 class="empty-title">${esc(title)}</h3>
    <p class="empty-desc">${esc(desc)}</p>
    ${cmd ? `<code class="empty-cmd mono">${esc(cmd)}</code>` : ''}
    <div class="empty-actions">
      <button type="button" class="btn primary" id="env-retry">${esc(t('retryBtn'))}</button>
      <button type="button" class="btn" id="env-settings">${esc(t('openSettingsBtn'))}</button>
    </div>
  `;
  $('env-retry')?.addEventListener('click', () => refreshAll());
  $('env-settings')?.addEventListener('click', () => window.deck?.ui?.openSettings?.());
}

function renderDetail() {
  const errEl = $('env-error');
  const emptyEl = $('empty-detail');
  const paneEl = $('detail-pane');

  if (state.envError && !state.preview) {
    errEl.hidden = false;
    emptyEl.hidden = true;
    paneEl.hidden = true;
    renderEnvError();
    return;
  }
  errEl.hidden = true;

  if (state.selectedNumber == null) {
    emptyEl.hidden = false;
    paneEl.hidden = true;
    return;
  }

  const listSummary = activeItems().find(x => x.number === state.selectedNumber);
  const item = state.detailCache.get(detailKey(state.view, state.selectedNumber)) || listSummary;
  if (!item) {
    emptyEl.hidden = false;
    paneEl.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  paneEl.hidden = false;

  const isPr = state.view === 'prs';
  const stInfo = isPr ? prStatusInfo(item) : issueStatusInfo(item);
  const author = item.author?.login || 'ghost';
  const checks = isPr ? state.checksCache.get(item.number) || item.statusCheckRollup || [] : [];
  const checkSum = summarizeChecks(checks);
  const session = state.sessions[detailKey(state.view, item.number)];
  const isOpen = String(item.state || '').toUpperCase() === 'OPEN';

  const actionButtons = isPr
    ? `
      ${isOpen ? `<button type="button" class="btn" data-act="checkout">${esc(t('actCheckout'))}</button>` : ''}
      ${isOpen && !item.isDraft ? `<button type="button" class="btn primary" data-act="merge">${esc(t('actMerge'))}</button>` : ''}
      ${isOpen && item.isDraft ? `<button type="button" class="btn primary" data-act="ready">${esc(t('actReady'))}</button>` : ''}
      <div class="menu-wrap">
        <button type="button" class="btn soft" data-act="toggle-agent-menu">${esc(t('actAgentMenu'))}</button>
        <div class="popover menu-list" id="agent-action-menu" ${state.activeMenuOpen ? '' : 'hidden'}>
          <button type="button" class="menu-item" data-agent-act="pr-review">${esc(t('actAiReview'))}</button>
          ${checkSum.failed > 0 ? `<button type="button" class="menu-item" data-agent-act="pr-fix-ci">${esc(t('actAiFixCi'))}</button>` : ''}
          <button type="button" class="menu-item" data-agent-act="pr-address-review">${esc(t('actAiAddressReview'))}</button>
          <div class="menu-sep"></div>
          <button type="button" class="menu-item" data-agent-act="compose">${esc(t('actSendToComposer'))}</button>
          <div class="menu-sep"></div>
          ${isOpen && !item.isDraft ? `<button type="button" class="menu-item" data-act="draft">${esc(t('actDraft'))}</button>` : ''}
          ${isOpen ? `<button type="button" class="menu-item" data-act="close" style="color:var(--drift)">${esc(t('actClose'))}</button>` : ''}
          ${String(item.state || '').toUpperCase() === 'CLOSED' ? `<button type="button" class="menu-item" data-act="reopen">${esc(t('actReopen'))}</button>` : ''}
        </div>
      </div>
      ${item.url ? `<button type="button" class="btn" data-open-url="${esc(item.url)}">${esc(t('actOpenGh'))}</button>` : ''}
    `
    : `
      <button type="button" class="btn soft" data-agent-act="issue-solve">${esc(t('actAiSolveIssue'))}</button>
      <button type="button" class="btn" data-agent-act="compose">${esc(t('actSendToComposer'))}</button>
      ${isOpen ? `<button type="button" class="btn danger" data-act="close">${esc(t('actClose'))}</button>` : `<button type="button" class="btn" data-act="reopen">${esc(t('actReopen'))}</button>`}
      ${item.url ? `<button type="button" class="btn" data-open-url="${esc(item.url)}">${esc(t('actOpenGh'))}</button>` : ''}
    `;

  const sessionStrip = session
    ? `
      <div class="session-strip">
        <div class="session-strip-left">
          <span class="sdot ${session.status === 'running' ? 'open' : session.status === 'error' ? 'drift' : 'done'}"></span>
          <strong>${esc(session.label)}</strong>
          <span class="mono" style="color:var(--muted)">${esc(session.status)}</span>
        </div>
        <button type="button" class="btn sm" data-open-session="${esc(session.sessionId)}">${esc(t('sessionOpen'))}</button>
      </div>
    `
    : '';

  const subtabsHtml = isPr
    ? `
      <div class="subtabs" role="tablist">
        <button type="button" class="subtab ${state.subtab === 'overview' ? 'active' : ''}" data-subtab="overview">${esc(t('subOverview'))}</button>
        <button type="button" class="subtab ${state.subtab === 'checks' ? 'active' : ''}" data-subtab="checks">
          ${esc(t('subChecks'))}<span class="subtab-badge">${checks.length}</span>
        </button>
        <button type="button" class="subtab ${state.subtab === 'files' ? 'active' : ''}" data-subtab="files">
          ${esc(t('subFiles'))}<span class="subtab-badge">${item.changedFiles ?? item.files?.length ?? 0}</span>
        </button>
      </div>
    `
    : '';

  let bodyHtml = '';
  if (!isPr || state.subtab === 'overview') {
    bodyHtml = renderOverviewTab(item, isPr, checkSum);
  } else if (state.subtab === 'checks') {
    bodyHtml = `
      ${
        checkSum.failed > 0
          ? `<div class="inote err" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <span>${esc(t('checksFailed', checkSum))}</span>
              <button type="button" class="btn sm primary" data-agent-act="pr-fix-ci">${esc(t('actAiFixCi'))}</button>
            </div>`
          : ''
      }
      ${renderChecksList(checks)}
    `;
  } else if (state.subtab === 'files') {
    const diffEntry = state.diffCache.get(item.number);
    if (state.loadingDiff || !diffEntry) {
      bodyHtml = `<p class="empty-inline">${esc(t('diffLoading'))}</p>`;
    } else {
      const parsed = parseUnifiedDiff(diffEntry.diff);
      bodyHtml = renderDiffFiles(parsed, item.files || [], diffEntry.truncated);
    }
  }

  paneEl.innerHTML = `
    <header class="detail-head">
      <div class="dh-top">
        <div class="dh-title-wrap">
          <h2 class="dh-title">${esc(item.title)}<span class="dh-num mono">#${item.number}</span></h2>
          <div class="dh-meta">
            <span class="pill ${stInfo.cls === 'open' ? 'done' : stInfo.cls === 'closed' ? 'drift' : stInfo.cls === 'draft' ? 'gate' : 'merged'}">
              <span class="sdot ${stInfo.cls}"></span>${esc(stInfo.label)}
            </span>
            <span class="avatar">${esc(initials(author))}</span>
            <span>${esc(author)}</span>
            <span>· ${esc(formatRelTime(item.updatedAt || item.createdAt))}</span>
            ${
              isPr && item.headRefName
                ? `<span class="branch-badge mono">${esc(item.headRefName)} → ${esc(item.baseRefName || 'main')}</span>`
                : ''
            }
            ${
              isPr && (item.additions != null || item.deletions != null)
                ? `<span class="mono diff-stat"><span class="add">+${item.additions ?? 0}</span> <span class="del">-${item.deletions ?? 0}</span></span>`
                : ''
            }
          </div>
        </div>
        <div class="dh-actions">${actionButtons}</div>
      </div>
      ${sessionStrip}
      ${subtabsHtml}
    </header>
    <div class="detail-scroll">${bodyHtml}</div>
  `;
}

function renderOverviewTab(item, isPr, checkSum) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const reviews = isPr && Array.isArray(item.reviews) ? item.reviews.filter(r => r.body || r.state !== 'COMMENTED') : [];
  const timeline = [
    ...comments.map(c => ({ kind: 'comment', author: c.author?.login || 'ghost', at: c.createdAt, body: c.body, state: '' })),
    ...reviews.map(r => ({ kind: 'review', author: r.author?.login || 'ghost', at: r.submittedAt, body: r.body, state: r.state })),
  ].sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));

  const timelineHtml =
    timeline.length > 0
      ? timeline
          .map(entry => {
            const badge =
              entry.kind === 'review' && entry.state
                ? `<span class="pill ${entry.state === 'APPROVED' ? 'done' : entry.state === 'CHANGES_REQUESTED' ? 'drift' : ''}">${esc(entry.state)}</span>`
                : '';
            return `
              <div class="comment-card">
                <div class="comment-head">
                  <span class="avatar">${esc(initials(entry.author))}</span>
                  <span class="comment-author">${esc(entry.author)}</span>
                  ${badge}
                  <span class="comment-time">${esc(formatRelTime(entry.at))}</span>
                </div>
                ${renderMarkdown(entry.body || '')}
              </div>
            `;
          })
          .join('')
      : `<p class="empty-inline">${esc(t('noComments'))}</p>`;

  const composerHtml = isPr
    ? `
      <div class="composer">
        <textarea class="textarea" id="reply-box" placeholder="${esc(t('reviewPlaceholder'))}"></textarea>
        <div class="composer-foot">
          <select class="state-select" id="review-event-select">
            <option value="comment">${esc(t('reviewActionComment'))}</option>
            <option value="approve">${esc(t('reviewActionApprove'))}</option>
            <option value="request-changes">${esc(t('reviewActionRequestChanges'))}</option>
          </select>
          <button type="button" class="btn primary" id="btn-submit-reply">${esc(t('submitReview'))}</button>
        </div>
      </div>
    `
    : `
      <div class="composer">
        <textarea class="textarea" id="reply-box" placeholder="${esc(t('commentPlaceholder'))}"></textarea>
        <div class="composer-foot">
          <span></span>
          <button type="button" class="btn primary" id="btn-submit-reply">${esc(t('postComment'))}</button>
        </div>
      </div>
    `;

  const labelsHtml =
    Array.isArray(item.labels) && item.labels.length > 0
      ? item.labels.map(renderLabelChip).join('')
      : `<span style="color:var(--faint)">${esc(t('metaNone'))}</span>`;

  const assigneesHtml =
    Array.isArray(item.assignees) && item.assignees.length > 0
      ? item.assignees.map(a => `<span class="label-chip">${esc(a.login || a)}</span>`).join('')
      : `<span style="color:var(--faint)">${esc(t('metaNone'))}</span>`;

  const reviewersList = [
    ...(Array.isArray(item.reviewRequests) ? item.reviewRequests.map(r => r.login || r.name).filter(Boolean) : []),
    ...(Array.isArray(item.reviews) ? item.reviews.map(r => r.author?.login).filter(Boolean) : []),
  ];
  const uniqueReviewers = [...new Set(reviewersList)];
  const revDecision = reviewDecisionInfo(item.reviewDecision);

  const mergeableLabel =
    item.mergeable === 'MERGEABLE'
      ? `<span style="color:var(--done)">${esc(t('mergeableClean'))}</span>`
      : item.mergeable === 'CONFLICTING'
        ? `<span style="color:var(--drift)">${esc(t('mergeableConflicting'))}</span>`
        : `<span style="color:var(--faint)">${esc(t('mergeableUnknown'))}</span>`;

  const checksLabel =
    checkSum.total === 0
      ? `<span style="color:var(--faint)">${esc(t('metaNone'))}</span>`
      : checkSum.failed > 0
        ? `<span style="color:var(--drift)">${esc(t('checksFailed', checkSum))}</span>`
        : checkSum.pending > 0
          ? `<span style="color:var(--gate)">${esc(t('checksPending', checkSum))}</span>`
          : `<span style="color:var(--done)">${esc(t('checksPassed', checkSum))}</span>`;

  return `
    <div class="overview-grid">
      <div>
        <div class="card">${renderMarkdown(item.body)}</div>
        <div class="section-head">${esc(t('commentsTitle'))} (${timeline.length})</div>
        ${timelineHtml}
        ${composerHtml}
      </div>
      <aside class="meta-rail">
        <div class="meta-box">
          ${
            isPr
              ? `
                <div>
                  <div class="meta-item-label">${esc(t('metaReviewers'))}</div>
                  <div class="meta-item-val">
                    ${revDecision ? `<span class="pill ${revDecision.cls}">${esc(revDecision.label)}</span>` : ''}
                    ${uniqueReviewers.map(u => `<span class="label-chip">${esc(u)}</span>`).join('') || `<span style="color:var(--faint)">${esc(t('metaNone'))}</span>`}
                  </div>
                </div>
                <div>
                  <div class="meta-item-label">${esc(t('metaChecks'))}</div>
                  <div class="meta-item-val">${checksLabel}</div>
                </div>
                <div>
                  <div class="meta-item-label">${esc(t('metaMergeable'))}</div>
                  <div class="meta-item-val">${mergeableLabel}</div>
                </div>
              `
              : ''
          }
          <div>
            <div class="meta-item-label">${esc(t('metaAssignees'))}</div>
            <div class="meta-item-val">${assigneesHtml}</div>
          </div>
          <div>
            <div class="meta-item-label">${esc(t('metaLabels'))}</div>
            <div class="meta-item-val">${labelsHtml}</div>
          </div>
          ${
            item.milestone?.title
              ? `<div><div class="meta-item-label">${esc(t('metaMilestone'))}</div><div class="meta-item-val">${esc(item.milestone.title)}</div></div>`
              : ''
          }
        </div>
      </aside>
    </div>
  `;
}

// ---------- Actions & Modals

function guardPreview() {
  if (state.preview) {
    showToast(t('toastPreviewReadonly'));
    return true;
  }
  return false;
}

function openExternalUrl(url) {
  if (!url) return;
  if (state.preview) {
    showToast(t('toastPreviewReadonly'));
    return;
  }
  window.deck?.ui?.open?.({ url }).catch(err => showToast(err?.message || 'Cannot open URL'));
}

async function handleReplySubmit() {
  if (guardPreview()) return;
  const box = $('reply-box');
  const body = String(box?.value || '').trim();
  const number = state.selectedNumber;
  if (number == null) return;

  const btn = $('btn-submit-reply');
  if (state.view === 'prs') {
    const event = $('review-event-select')?.value || 'comment';
    if (!body && event !== 'approve') return;
    btn.disabled = true;
    try {
      if (event === 'comment') {
        await gh.commentPr({ repo: repoSlug(), number, body });
        showToast(t('toastCommentPosted'));
      } else {
        await gh.reviewPr({ repo: repoSlug(), number, event, body });
        showToast(t('toastReviewSubmitted'));
      }
      box.value = '';
      await loadItemDetail('prs', number, { force: true });
    } catch (err) {
      showToast(err?.message || 'Failed to submit');
    } finally {
      btn.disabled = false;
    }
  } else {
    if (!body) return;
    btn.disabled = true;
    try {
      await gh.commentIssue({ repo: repoSlug(), number, body });
      showToast(t('toastCommentPosted'));
      box.value = '';
      await loadItemDetail('issues', number, { force: true });
    } catch (err) {
      showToast(err?.message || 'Failed to post comment');
    } finally {
      btn.disabled = false;
    }
  }
}

function openModal(html) {
  $('modal-dialog').innerHTML = html;
  $('modal-backdrop').hidden = false;
}

function closeModal() {
  $('modal-backdrop').hidden = true;
  $('modal-dialog').innerHTML = '';
}

function openCreatePrModal() {
  if (guardPreview()) return;
  const base = state.env?.defaultBranch || 'main';
  openModal(`
    <div class="modal-head">
      <h3>${esc(t('modalNewPrTitle'))}</h3>
      <button type="button" class="ico" data-close-modal>✕</button>
    </div>
    <div class="modal-body">
      <div class="field">
        <div class="field-label">
          <span>${esc(t('fieldTitle'))}</span>
          <button type="button" class="btn sm soft" id="btn-ai-draft-pr">✨ ${esc(t('btnAiDraftPr'))}</button>
        </div>
        <input type="text" class="input" id="pr-title-input" />
      </div>
      <div class="field">
        <span class="field-label">${esc(t('fieldBase'))}</span>
        <input type="text" class="input mono" id="pr-base-input" value="${esc(base)}" />
      </div>
      <div class="field">
        <span class="field-label">${esc(t('fieldBody'))}</span>
        <textarea class="textarea" id="pr-body-input" rows="5"></textarea>
      </div>
      <label class="check-label">
        <input type="checkbox" id="pr-draft-check" />
        <span>${esc(t('fieldDraft'))}</span>
      </label>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close-modal>${esc(t('btnCancel'))}</button>
      <button type="button" class="btn primary" id="btn-confirm-create-pr">${esc(t('btnCreatePr'))}</button>
    </div>
  `);

  $('btn-ai-draft-pr')?.addEventListener('click', handleAiDraftPr);
  $('btn-confirm-create-pr')?.addEventListener('click', async () => {
    const title = $('pr-title-input').value.trim();
    const body = $('pr-body-input').value;
    const baseBranch = $('pr-base-input').value.trim();
    const draft = $('pr-draft-check').checked;
    if (!title) return;
    const btn = $('btn-confirm-create-pr');
    btn.disabled = true;
    try {
      await gh.createPr({ repo: repoSlug(), title, body, base: baseBranch, draft });
      closeModal();
      showToast(t('toastPrCreated'));
      await refreshCurrentList();
    } catch (err) {
      showToast(err?.message || 'Failed to create PR');
      btn.disabled = false;
    }
  });
}

async function handleAiDraftPr() {
  const btn = $('btn-ai-draft-pr');
  if (!btn || !window.deck?.agent?.run) return;
  const base = $('pr-base-input')?.value.trim() || state.env?.defaultBranch || 'main';
  const head = state.env?.branch || 'HEAD';
  btn.disabled = true;
  btn.textContent = t('btnAiDrafting');
  try {
    const { commits, stat } = await gh.getBranchDraftContext({ base });
    const prompt = t('promptDraftPr', {
      head,
      base,
      commits: commits || '(no commits ahead)',
      stat: stat || '(no diff stat)',
    });
    const res = await window.deck.agent.run({
      prompt,
      focus: false,
      wait: true,
      dedupe: 'running',
      ...agentOverridesPayload(),
    });
    const text = String(res?.text || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.title && $('pr-title-input')) $('pr-title-input').value = String(parsed.title);
      if (parsed.body && $('pr-body-input')) $('pr-body-input').value = String(parsed.body);
    } else if (text.trim() && $('pr-body-input')) {
      $('pr-body-input').value = text.trim();
    }
  } catch (err) {
    showToast(err?.message || 'AI draft failed');
  } finally {
    btn.disabled = false;
    btn.textContent = `✨ ${t('btnAiDraftPr')}`;
  }
}

function openCreateIssueModal() {
  if (guardPreview()) return;
  openModal(`
    <div class="modal-head">
      <h3>${esc(t('modalNewIssueTitle'))}</h3>
      <button type="button" class="ico" data-close-modal>✕</button>
    </div>
    <div class="modal-body">
      <div class="field">
        <span class="field-label">${esc(t('fieldTitle'))}</span>
        <input type="text" class="input" id="iss-title-input" />
      </div>
      <div class="field">
        <span class="field-label">${esc(t('fieldLabels'))}</span>
        <input type="text" class="input" id="iss-labels-input" placeholder="bug, enhancement" />
      </div>
      <div class="field">
        <span class="field-label">${esc(t('fieldBody'))}</span>
        <textarea class="textarea" id="iss-body-input" rows="5"></textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close-modal>${esc(t('btnCancel'))}</button>
      <button type="button" class="btn primary" id="btn-confirm-create-issue">${esc(t('btnCreateIssue'))}</button>
    </div>
  `);

  $('btn-confirm-create-issue')?.addEventListener('click', async () => {
    const title = $('iss-title-input').value.trim();
    const body = $('iss-body-input').value;
    const labels = $('iss-labels-input')
      .value.split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!title) return;
    const btn = $('btn-confirm-create-issue');
    btn.disabled = true;
    try {
      await gh.createIssue({ repo: repoSlug(), title, body, labels });
      closeModal();
      showToast(t('toastIssueCreated'));
      await refreshCurrentList();
    } catch (err) {
      showToast(err?.message || 'Failed to create issue');
      btn.disabled = false;
    }
  });
}

function openMergeModal(pr) {
  if (guardPreview()) return;
  const method = state.params.mergeMethod || 'squash';
  openModal(`
    <div class="modal-head">
      <h3>${esc(t('modalMergeTitle', { n: pr.number }))}</h3>
      <button type="button" class="ico" data-close-modal>✕</button>
    </div>
    <div class="modal-body">
      <p style="margin:0;color:var(--muted)">${esc(
        t('confirmMergeDetail', { n: pr.number, head: pr.headRefName || '', base: pr.baseRefName || 'main', method }),
      )}</p>
      <div class="field">
        <span class="field-label">${esc(t('fieldMergeMethod'))}</span>
        <select class="state-select" id="merge-method-select">
          <option value="squash" ${method === 'squash' ? 'selected' : ''}>Squash and merge</option>
          <option value="merge" ${method === 'merge' ? 'selected' : ''}>Create a merge commit</option>
          <option value="rebase" ${method === 'rebase' ? 'selected' : ''}>Rebase and merge</option>
        </select>
      </div>
      <label class="check-label">
        <input type="checkbox" id="merge-del-branch" />
        <span>${esc(t('fieldDeleteBranch'))}</span>
      </label>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close-modal>${esc(t('btnCancel'))}</button>
      <button type="button" class="btn primary" id="btn-confirm-merge">${esc(t('btnConfirmMerge'))}</button>
    </div>
  `);

  $('btn-confirm-merge')?.addEventListener('click', async () => {
    const chosen = $('merge-method-select').value;
    const deleteBranch = $('merge-del-branch').checked;
    const btn = $('btn-confirm-merge');
    btn.disabled = true;
    try {
      await gh.mergePr({ repo: repoSlug(), number: pr.number, method: chosen, deleteBranch });
      closeModal();
      showToast(t('toastMerged', { n: pr.number }));
      await refreshCurrentList();
    } catch (err) {
      showToast(err?.message || 'Merge failed');
      btn.disabled = false;
    }
  });
}

function openConfirmModal(message, onConfirm) {
  openModal(`
    <div class="modal-head">
      <h3>${esc(t('modalConfirmTitle'))}</h3>
      <button type="button" class="ico" data-close-modal>✕</button>
    </div>
    <div class="modal-body"><p style="margin:0">${esc(message)}</p></div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close-modal>${esc(t('btnCancel'))}</button>
      <button type="button" class="btn danger" id="btn-confirm-yes">${esc(t('btnConfirm'))}</button>
    </div>
  `);
  $('btn-confirm-yes')?.addEventListener('click', async () => {
    const btn = $('btn-confirm-yes');
    btn.disabled = true;
    try {
      await onConfirm();
      closeModal();
    } catch (err) {
      showToast(err?.message || 'Action failed');
      btn.disabled = false;
    }
  });
}

// ---------- Agent Integration

function agentOverridesPayload() {
  const out = {};
  if (state.agentOverride.provider) out.provider = state.agentOverride.provider;
  if (state.agentOverride.model) out.model = state.agentOverride.model;
  if (state.agentOverride.effort) out.effort = state.agentOverride.effort;
  return out;
}

async function initAgentControls() {
  if (!window.deck?.agent?.catalog) return;
  try {
    state.agentCatalog = await window.deck.agent.catalog();
    const saved = await window.deck.store?.get?.(AGENT_KEY).catch(() => null);
    if (saved && typeof saved === 'object') {
      state.agentOverride = {
        provider: saved.provider || '',
        model: saved.model || '',
        effort: saved.effort || '',
      };
    }
    renderAgentPicker();
    $('agent-wrap').hidden = false;

    window.deck.agent.onEvent?.('*', ev => {
      if (!ev?.sessionId) return;
      for (const [k, s] of Object.entries(state.sessions)) {
        if (s.sessionId === ev.sessionId && ev.status && ev.status !== s.status) {
          s.status = ev.status;
          renderDetail();
        }
      }
    });
  } catch {
    // agent catalog unavailable
  }
}

function renderAgentPicker() {
  const catalog = state.agentCatalog;
  const agents = Array.isArray(catalog?.agents) ? catalog.agents : [];
  if (agents.length === 0) return;

  const defaults = catalog?.defaults || {};
  const activeProv = state.agentOverride.provider || defaults.provider || agents[0].id;
  const agentObj = agents.find(a => a.id === activeProv) || agents[0];
  const models = Array.isArray(agentObj?.models) ? agentObj.models : [];
  const activeModel = state.agentOverride.model || agentObj?.defaultModel || models[0]?.id || '';
  const modelObj = models.find(m => m.id === activeModel);
  const efforts = Array.isArray(modelObj?.efforts) ? modelObj.efforts : [];

  $('agent-label').textContent = `${agentObj.name || agentObj.id}${activeModel ? ` · ${activeModel}` : ''}`;

  const aSel = $('agent-select');
  aSel.innerHTML =
    `<option value="">${esc(t('agentFollowGlobal'))}</option>` +
    agents.map(a => `<option value="${esc(a.id)}" ${state.agentOverride.provider === a.id ? 'selected' : ''}>${esc(a.name || a.id)}</option>`).join('');

  const mSel = $('agent-model-select');
  mSel.innerHTML =
    `<option value="">${esc(t('agentDefault'))}</option>` +
    models.map(m => `<option value="${esc(m.id)}" ${state.agentOverride.model === m.id ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('');

  const eRow = $('agent-effort-row');
  const eSel = $('agent-effort-select');
  if (efforts.length > 0) {
    eRow.hidden = false;
    eSel.innerHTML =
      `<option value="">${esc(t('agentDefault'))}</option>` +
      efforts.map(e => `<option value="${esc(e)}" ${state.agentOverride.effort === e ? 'selected' : ''}>${esc(e)}</option>`).join('');
  } else {
    eRow.hidden = true;
  }

  const hasOverride = Boolean(state.agentOverride.provider || state.agentOverride.model || state.agentOverride.effort);
  $('agent-reset').hidden = !hasOverride;
  $('agent-save-default').hidden = !hasOverride;
}

async function runAgentAction(kind) {
  if (guardPreview()) return;
  const item =
    state.detailCache.get(detailKey(state.view, state.selectedNumber)) ||
    activeItems().find(x => x.number === state.selectedNumber);
  if (!item) return;
  const repo = repoSlug();

  if (kind === 'compose') {
    const contextBody = [
      `${state.view === 'prs' ? 'Pull Request' : 'Issue'} #${item.number}: ${item.title}`,
      `Repository: ${repo}`,
      item.url ? `URL: ${item.url}` : '',
      item.headRefName ? `Branch: ${item.headRefName} -> ${item.baseRefName || 'main'}` : '',
      '',
      item.body || '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await window.deck.agent.compose({
        target: 'new',
        focus: true,
        draft: state.view === 'prs' ? `Review PR #${item.number}: ${item.title}` : `Work on Issue #${item.number}: ${item.title}`,
        items: [
          {
            kind: 'paste',
            title: `${state.view === 'prs' ? 'PR' : 'Issue'} #${item.number}`,
            detail: item.title,
            body: contextBody,
          },
        ],
        ...agentOverridesPayload(),
      });
      showToast(t('toastComposed'));
    } catch (err) {
      showToast(err?.message || 'Compose failed');
    }
    return;
  }

  let prompt = '';
  let skill = '';
  let label = '';
  if (kind === 'pr-review') {
    skill = 'github-pr-review';
    label = `${t('actAiReview')} #${item.number}`;
    prompt = t('promptPrReview', {
      n: item.number,
      title: item.title,
      repo,
      head: item.headRefName || '',
      base: item.baseRefName || 'main',
    });
  } else if (kind === 'pr-fix-ci') {
    const checks = summarizeChecks(state.checksCache.get(item.number) || item.statusCheckRollup);
    label = `${t('actAiFixCi')} #${item.number}`;
    prompt = t('promptPrFixCi', {
      n: item.number,
      title: item.title,
      repo,
      head: item.headRefName || '',
      checks: checks.failedNames.join(', ') || 'CI checks',
    });
  } else if (kind === 'pr-address-review') {
    label = `${t('actAiAddressReview')} #${item.number}`;
    prompt = t('promptPrAddressReview', {
      n: item.number,
      title: item.title,
      repo,
      head: item.headRefName || '',
    });
  } else if (kind === 'issue-solve') {
    skill = 'github-issue-solve';
    label = `${t('actAiSolveIssue')} #${item.number}`;
    prompt = t('promptIssueSolve', {
      n: item.number,
      title: item.title,
      repo,
    });
  }

  try {
    const key = detailKey(state.view, item.number);
    state.sessions[key] = { sessionId: '', status: 'running', label };
    renderDetail();
    showToast(t('toastSessionStarted'));
    const res = await window.deck.agent.run({
      prompt,
      ...(skill ? { skill } : {}),
      focus: false,
      wait: false,
      dedupe: 'running',
      dedupeKey: `${key}:${kind}`,
      ...agentOverridesPayload(),
    });
    if (res?.sessionId) {
      state.sessions[key] = { sessionId: res.sessionId, status: res.status || 'running', label };
      renderDetail();
    }
  } catch (err) {
    showToast(err?.message || 'Failed to launch Agent');
  }
}

// ---------- Event Wiring

function wireStaticEvents() {
  $('rail-toggle').addEventListener('click', () => {
    state.railCollapsed = !state.railCollapsed;
    $('workspace').classList.toggle('rail-collapsed', state.railCollapsed);
    $('rail-toggle').setAttribute('aria-expanded', String(!state.railCollapsed));
  });

  document.querySelectorAll('.seg-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.view;
      if (next === state.view) return;
      state.view = next;
      state.subtab = 'overview';
      state.activeMenuOpen = false;
      const items = activeItems();
      state.selectedNumber = items[0]?.number ?? null;
      renderAll();
      if (state.selectedNumber != null) {
        loadItemDetail(state.view, state.selectedNumber, { force: false });
      }
    });
  });

  $('ctx-branch-pr').addEventListener('click', () => {
    const num = Number($('ctx-branch-pr').dataset.prNumber);
    if (!Number.isFinite(num)) return;
    state.view = 'prs';
    state.selectedNumber = num;
    state.subtab = 'overview';
    renderAll();
    loadItemDetail('prs', num, { force: false });
  });

  $('btn-create').addEventListener('click', () => {
    if (state.view === 'prs') openCreatePrModal();
    else openCreateIssueModal();
  });

  $('btn-refresh').addEventListener('click', () => refreshAll());
  $('btn-settings').addEventListener('click', () => window.deck?.ui?.openSettings?.());

  // Search (IME-safe)
  const searchEl = $('search-input');
  searchEl.addEventListener('compositionstart', () => {
    state.composing = true;
  });
  searchEl.addEventListener('compositionend', () => {
    state.composing = false;
  });
  searchEl.addEventListener('input', () => {
    state.search = searchEl.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshCurrentList(), 320);
  });
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !state.composing && !e.isComposing) {
      clearTimeout(searchTimer);
      refreshCurrentList();
    }
  });

  $('state-select').addEventListener('change', e => {
    if (state.view === 'prs') state.prState = e.target.value;
    else state.issueState = e.target.value;
    refreshCurrentList();
  });

  $('filter-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    if (state.view === 'prs') state.prFilter = chip.dataset.filter;
    else state.issueFilter = chip.dataset.filter;
    renderFilterControls();
    refreshCurrentList();
  });

  $('item-list').addEventListener('click', e => {
    const row = e.target.closest('[data-number]');
    if (!row) return;
    const num = Number(row.dataset.number);
    if (num === state.selectedNumber) return;
    state.selectedNumber = num;
    state.subtab = 'overview';
    state.activeMenuOpen = false;
    renderList();
    renderDetail();
    loadItemDetail(state.view, num, { force: false });
  });

  // Detail pane delegated events
  $('detail-pane').addEventListener('click', async e => {
    const openUrlEl = e.target.closest('[data-open-url]');
    if (openUrlEl) {
      e.preventDefault();
      openExternalUrl(openUrlEl.dataset.openUrl);
      return;
    }
    const openSessEl = e.target.closest('[data-open-session]');
    if (openSessEl) {
      window.deck?.agent?.open?.(openSessEl.dataset.openSession, { closeDeck: false });
      return;
    }
    const subtabEl = e.target.closest('[data-subtab]');
    if (subtabEl) {
      state.subtab = subtabEl.dataset.subtab;
      renderDetail();
      if (state.subtab === 'files' && state.selectedNumber != null) {
        ensureDiffLoaded(state.selectedNumber);
      }
      return;
    }
    const agentActEl = e.target.closest('[data-agent-act]');
    if (agentActEl) {
      state.activeMenuOpen = false;
      renderDetail();
      await runAgentAction(agentActEl.dataset.agentAct);
      return;
    }
    if (e.target.closest('#btn-submit-reply')) {
      await handleReplySubmit();
      return;
    }
    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const act = actEl.dataset.act;
    if (act === 'toggle-agent-menu') {
      state.activeMenuOpen = !state.activeMenuOpen;
      const menu = $('agent-action-menu');
      if (menu) menu.hidden = !state.activeMenuOpen;
      return;
    }
    state.activeMenuOpen = false;
    const item =
      state.detailCache.get(detailKey(state.view, state.selectedNumber)) ||
      activeItems().find(x => x.number === state.selectedNumber);
    if (!item) return;

    if (act === 'merge') {
      openMergeModal(item);
    } else if (act === 'checkout') {
      if (guardPreview()) return;
      try {
        await gh.checkoutPr({ repo: repoSlug(), number: item.number });
        showToast(t('toastCheckoutOk', { n: item.number }));
        await refreshAll();
      } catch (err) {
        showToast(err?.message || 'Checkout failed');
      }
    } else if (act === 'close') {
      if (guardPreview()) return;
      const msg = state.view === 'prs' ? t('confirmClosePr', { n: item.number }) : t('confirmCloseIssue', { n: item.number });
      openConfirmModal(msg, async () => {
        if (state.view === 'prs') await gh.setPrState({ repo: repoSlug(), number: item.number, action: 'close' });
        else await gh.setIssueState({ repo: repoSlug(), number: item.number, action: 'close' });
        showToast(t('toastStateUpdated'));
        await refreshCurrentList();
      });
    } else if (act === 'reopen' || act === 'ready' || act === 'draft') {
      if (guardPreview()) return;
      try {
        if (state.view === 'prs') await gh.setPrState({ repo: repoSlug(), number: item.number, action: act });
        else await gh.setIssueState({ repo: repoSlug(), number: item.number, action: act });
        showToast(t('toastStateUpdated'));
        await refreshCurrentList();
      } catch (err) {
        showToast(err?.message || 'Status update failed');
      }
    }
  });

  // Agent Popover
  $('agent-btn').addEventListener('click', () => {
    const pop = $('agent-pop');
    pop.hidden = !pop.hidden;
    $('agent-btn').setAttribute('aria-expanded', String(!pop.hidden));
  });
  $('agent-select').addEventListener('change', e => {
    state.agentOverride.provider = e.target.value;
    state.agentOverride.model = '';
    state.agentOverride.effort = '';
    renderAgentPicker();
  });
  $('agent-model-select').addEventListener('change', e => {
    state.agentOverride.model = e.target.value;
    state.agentOverride.effort = '';
    renderAgentPicker();
  });
  $('agent-effort-select').addEventListener('change', e => {
    state.agentOverride.effort = e.target.value;
    renderAgentPicker();
  });
  $('agent-reset').addEventListener('click', async () => {
    state.agentOverride = { provider: '', model: '', effort: '' };
    await window.deck?.store?.delete?.(AGENT_KEY).catch(() => {});
    renderAgentPicker();
  });
  $('agent-save-default').addEventListener('click', async () => {
    await window.deck?.store?.put?.(AGENT_KEY, state.agentOverride).catch(() => {});
    $('agent-pop').hidden = true;
    showToast(t('agentSaveDefault'));
  });

  // Modal close
  $('modal-backdrop').addEventListener('click', e => {
    if (e.target === $('modal-backdrop') || e.target.closest('[data-close-modal]')) {
      closeModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      $('agent-pop').hidden = true;
      if (state.activeMenuOpen) {
        state.activeMenuOpen = false;
        const menu = $('agent-action-menu');
        if (menu) menu.hidden = true;
      }
    }
  });
}

boot();
