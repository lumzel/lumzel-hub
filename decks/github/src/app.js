// Lumzel GitHub Deck controller: gh CLI PR & Issue workflows + Lumzel Agent integration.
import { t, applyI18n, setLocale, getLocale } from './i18n.js';
import { getSampleData } from './sample.js';
import * as gh from './gh.js';
import {
  esc,
  formatRelTime,
  renderAvatar,
  summarizeChecks,
  prStatusInfo,
  issueStatusInfo,
  reviewDecisionInfo,
  renderLabelChip,
  renderRichBody,
  parseUnifiedDiff,
  renderDiffFiles,
  renderDiffFileCard,
  renderDiffLinesSlice,
  DIFF_MORE_LINES,
  renderChecksList,
} from './render.js';

const $ = id => document.getElementById(id);

const CACHE_KEY = 'github-deck:cache:v1';
const AGENT_KEY = 'github-deck:agent:v1';
const AVATAR_KEY = 'github-deck:avatars:v1';
const COMMENTS_BATCH_SIZE = 20;
const DIFF_FILES_BATCH = 12;
const MEDIA_CONCURRENCY = 4;

const avatarCache = new Map(); // login -> data:image/... | 'ERROR'
const avatarInflight = new Set();
const imageCache = new Map(); // url -> data:image/... | 'TOO_LARGE' | 'ERROR'
const imageInflight = new Set();
const signedUrlCache = new Map(); // `${repo}:${number}` -> Map(uuid|url -> signedUrl)
const htmlBundleCache = new Map(); // `${repo}:${number}` -> { bodyHtml, commentHtmlByKey, reviewHtmlByKey, signedImageMap, commentsHasMore, commentsPage }

const narrowMq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : null;
let listObserver = null;
let detailScrollObserver = null;
let mediaObserver = null;
const mediaTaskQueue = [];
let mediaActiveCount = 0;

function makeListMeta() {
  return { loaded: false, endCursor: null, hasMore: false, loadingMore: false, totalCount: null };
}

const state = {
  preview: false,
  theme: 'light',
  params: { repo: '', defaultTab: 'prs', pageSize: '30', mergeMethod: 'squash' },
  env: null, // { viewer, repo, defaultBranch, repoUrl, branch, dirtyCount }
  envError: null,
  installPlan: null, // { supported, platform, manager, command, docUrl, reason }
  envActionError: '',
  view: 'prs', // 'prs' | 'issues'
  prState: 'open',
  issueState: 'open',
  prFilter: 'all', // 'all' | 'mine' | 'review' | 'branch'
  issueFilter: 'all', // 'all' | 'mine' | 'assigned' | 'mentioned'
  search: '',
  prs: [],
  issues: [],
  listMeta: {
    prs: makeListMeta(),
    issues: makeListMeta(),
  },
  selectedNumber: null,
  detailCache: new Map(), // `${view}:${number}` -> detail obj
  checksCache: new Map(), // number -> checks[]
  diffCache: new Map(), // number -> { diff, parsed, truncated, error? }
  activeTimeline: null, // { key, repo, number, items, renderedCount, loadingMore, remotePage, remoteHasMore }
  activeDiffRender: null, // { number, files, renderedCount }
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

function isNarrowScreen() {
  return Boolean(narrowMq?.matches);
}

function syncRailScrim() {
  const scrim = $('rail-scrim');
  if (!scrim) return;
  scrim.hidden = !(isNarrowScreen() && !state.railCollapsed);
}

function setRailCollapsed(collapsed) {
  state.railCollapsed = Boolean(collapsed);
  $('workspace')?.classList.toggle('rail-collapsed', state.railCollapsed);
  $('rail-toggle')?.setAttribute('aria-expanded', String(!state.railCollapsed));
  syncRailScrim();
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
  syncRailScrim();

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
  state.listMeta.prs = { loaded: true, endCursor: null, hasMore: false, loadingMore: false, totalCount: sample.prs.length };
  state.listMeta.issues = { loaded: true, endCursor: null, hasMore: false, loadingMore: false, totalCount: sample.issues.length };
  for (const pr of sample.prs) {
    state.detailCache.set(detailKey('prs', pr.number), pr);
    state.checksCache.set(pr.number, pr.statusCheckRollup || []);
    const diff = pr.diff || '';
    state.diffCache.set(pr.number, { diff, parsed: parseUnifiedDiff(diff), truncated: false });
  }
  for (const iss of sample.issues) {
    state.detailCache.set(detailKey('issues', iss.number), iss);
  }
  state.selectedNumber = sample.prs[0]?.number ?? null;
  $('preview-banner').hidden = false;
  if (isNarrowScreen() && state.selectedNumber != null) {
    setRailCollapsed(true);
  } else {
    syncRailScrim();
  }
  renderAll();
}

async function hydrateCache() {
  if (!window.deck?.store?.get) return;
  try {
    const [cached, savedAvatars] = await Promise.all([
      window.deck.store.get(CACHE_KEY).catch(() => null),
      window.deck.store.get(AVATAR_KEY).catch(() => null),
    ]);
    if (savedAvatars && typeof savedAvatars === 'object') {
      for (const [login, dataUrl] of Object.entries(savedAvatars)) {
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
          avatarCache.set(login, dataUrl);
        }
      }
    }
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

let avatarPersistTimer = null;
function schedulePersistAvatars() {
  if (state.preview || !window.deck?.store?.put) return;
  clearTimeout(avatarPersistTimer);
  avatarPersistTimer = setTimeout(() => {
    const obj = {};
    let count = 0;
    for (const [k, v] of avatarCache.entries()) {
      if (typeof v === 'string' && v.startsWith('data:image/') && count < 40) {
        obj[k] = v;
        count++;
      }
    }
    window.deck.store.put(AVATAR_KEY, obj).catch(() => {});
  }, 800);
}

function enqueueMediaTask(task) {
  mediaTaskQueue.push(task);
  drainMediaQueue();
}

function drainMediaQueue() {
  while (mediaActiveCount < MEDIA_CONCURRENCY && mediaTaskQueue.length > 0) {
    const task = mediaTaskQueue.shift();
    mediaActiveCount++;
    Promise.resolve()
      .then(task)
      .catch(() => {})
      .finally(() => {
        mediaActiveCount--;
        drainMediaQueue();
      });
  }
}

function fetchAvatarForLogin(login) {
  if (!login || login === 'ghost' || avatarCache.has(login) || avatarInflight.has(login)) return;
  avatarInflight.add(login);
  enqueueMediaTask(async () => {
    try {
      const dataUrl = await gh.fetchImageDataUrl(`https://github.com/${encodeURIComponent(login)}.png?size=64`);
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        avatarCache.set(login, dataUrl);
        schedulePersistAvatars();
        document.querySelectorAll(`[data-avatar-login="${CSS.escape(login)}"]`).forEach(el => {
          el.innerHTML = `<img class="avatar-img" src="${dataUrl}" alt="${esc(login)}" />`;
        });
      } else {
        avatarCache.set(login, 'ERROR');
      }
    } finally {
      avatarInflight.delete(login);
    }
  });
}

function replaceImagePlaceholder(node, rawUrl, alt, result) {
  if (result.startsWith('data:image/')) {
    node.outerHTML = `<figure class="md-img-wrap"><img class="md-img" src="${result}" alt="${esc(alt)}" data-open-url="${esc(rawUrl)}" /></figure>`;
  } else {
    node.outerHTML = `<div class="md-img-fallback"><button type="button" class="md-link" data-open-url="${esc(rawUrl)}">🖼 ${esc(alt)} ↗</button></div>`;
  }
}

function fetchInlineImage(rawUrl, alt) {
  if (!rawUrl || imageInflight.has(rawUrl)) return;
  const cached = imageCache.get(rawUrl);
  if (cached) {
    document.querySelectorAll(`[data-gh-img="${CSS.escape(rawUrl)}"]`).forEach(node => {
      replaceImagePlaceholder(node, rawUrl, node.getAttribute('data-gh-alt') || alt, cached);
    });
    return;
  }
  imageInflight.add(rawUrl);
  const slug = repoSlug();
  const num = state.selectedNumber;
  const signedKey = slug && num != null ? `${slug}:${num}` : '';

  enqueueMediaTask(async () => {
    try {
      let fetchUrl = rawUrl;
      if (rawUrl.includes('github.com/user-attachments/assets/') && signedKey) {
        let signedMap = signedUrlCache.get(signedKey);
        if (!signedMap) {
          const bundle = await gh.fetchRenderedHtmlBundle({ repo: slug, number: num, isPr: state.view === 'prs' });
          htmlBundleCache.set(signedKey, bundle);
          signedMap = bundle.signedImageMap;
          signedUrlCache.set(signedKey, signedMap);
        }
        const uuidM = rawUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidM && signedMap.has(uuidM[0].toLowerCase())) {
          fetchUrl = signedMap.get(uuidM[0].toLowerCase());
        }
      }
      const dataUrl = await gh.fetchImageDataUrl(fetchUrl);
      const result = dataUrl || 'ERROR';
      imageCache.set(rawUrl, result);
      document.querySelectorAll(`[data-gh-img="${CSS.escape(rawUrl)}"]`).forEach(node => {
        replaceImagePlaceholder(node, rawUrl, node.getAttribute('data-gh-alt') || alt, result);
      });
    } finally {
      imageInflight.delete(rawUrl);
    }
  });
}

function ensureMediaObserver() {
  if (mediaObserver || typeof IntersectionObserver === 'undefined') return mediaObserver;
  mediaObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        mediaObserver.unobserve(el);
        const login = el.getAttribute('data-avatar-login')?.trim();
        if (login) {
          fetchAvatarForLogin(login);
          continue;
        }
        const rawUrl = el.getAttribute('data-gh-img');
        if (rawUrl) {
          fetchInlineImage(rawUrl, el.getAttribute('data-gh-alt') || 'Image');
        }
      }
    },
    { rootMargin: '160px', threshold: 0.01 },
  );
  return mediaObserver;
}

function hydrateMediaInDom(root = document) {
  if (state.preview || !root) return;
  const observer = ensureMediaObserver();

  // 1. Hydrate GitHub user avatars lazily as they enter the viewport
  root.querySelectorAll('[data-avatar-login]').forEach(el => {
    const login = el.getAttribute('data-avatar-login')?.trim();
    if (!login || login === 'ghost') return;
    const cached = avatarCache.get(login);
    if (cached && cached.startsWith('data:image/')) {
      if (!el.querySelector('img')) {
        el.innerHTML = `<img class="avatar-img" src="${cached}" alt="${esc(login)}" />`;
      }
      return;
    }
    if (cached === 'ERROR') return;
    if (observer) {
      if (!el.dataset.mediaObserved) {
        el.dataset.mediaObserved = '1';
        observer.observe(el);
      }
    } else {
      fetchAvatarForLogin(login);
    }
  });

  // 2. Hydrate Issue/PR body & comment images lazily as they enter the viewport
  root.querySelectorAll('[data-gh-img]').forEach(el => {
    const rawUrl = el.getAttribute('data-gh-img') || '';
    const alt = el.getAttribute('data-gh-alt') || 'Image';
    if (!rawUrl) return;
    const cached = imageCache.get(rawUrl);
    if (cached) {
      replaceImagePlaceholder(el, rawUrl, alt, cached);
      return;
    }
    if (observer) {
      if (!el.dataset.mediaObserved) {
        el.dataset.mediaObserved = '1';
        observer.observe(el);
      }
    } else {
      fetchInlineImage(rawUrl, alt);
    }
  });
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

async function fetchListPage(view, { reset = false } = {}) {
  const slug = repoSlug();
  const meta = state.listMeta[view];
  const after = reset ? null : meta.endCursor;
  const page =
    view === 'prs'
      ? await gh.listPrsPage({
          repo: slug,
          state: state.prState,
          filter: state.prFilter,
          search: state.search,
          limit: pageSize(),
          after,
          branch: state.env?.branch || '',
        })
      : await gh.listIssuesPage({
          repo: slug,
          state: state.issueState,
          filter: state.issueFilter,
          search: state.search,
          limit: pageSize(),
          after,
        });

  if (reset) {
    if (view === 'prs') state.prs = page.items;
    else state.issues = page.items;
    meta.loaded = true;
    meta.endCursor = page.endCursor;
    meta.hasMore = page.hasMore;
    meta.totalCount = page.totalCount;
    return page.items;
  }

  const existing = view === 'prs' ? state.prs : state.issues;
  const seen = new Set(existing.map(x => x.number));
  const added = page.items.filter(x => !seen.has(x.number));
  if (view === 'prs') state.prs = [...existing, ...added];
  else state.issues = [...existing, ...added];
  meta.loaded = true;
  meta.endCursor = page.endCursor;
  meta.hasMore = page.hasMore && Boolean(page.endCursor);
  if (page.totalCount != null) meta.totalCount = page.totalCount;
  return added;
}

async function refreshAll() {
  if (state.preview) return;
  state.loadingList = true;
  state.envError = null;
  $('btn-refresh')?.classList.add('spinning');
  setSyncLabel(t('syncing'));

  try {
    state.env = await gh.probeEnvironment(state.params.repo || '');
    // Reset pagination for both tabs, but only eagerly fetch the active tab
    state.listMeta.prs = makeListMeta();
    state.listMeta.issues = makeListMeta();
    await fetchListPage(state.view, { reset: true });
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
    state.envActionError = '';
    if (err?.code === 'GH_NOT_FOUND') {
      state.installPlan = await gh.detectGhInstallPlan().catch(() => null);
    } else {
      state.installPlan = null;
    }
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
  const view = state.view;
  state.listMeta[view] = makeListMeta();
  try {
    await fetchListPage(view, { reset: true });
    await persistCache();
    if (state.view !== view) return;
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

async function loadMoreCurrentList() {
  const view = state.view;
  const meta = state.listMeta[view];
  if (state.preview || state.loadingList || !state.env || !meta || meta.loadingMore || !meta.hasMore || !meta.endCursor) {
    return;
  }
  meta.loadingMore = true;
  const sentinel = $('list-sentinel');
  if (sentinel) sentinel.textContent = t('loadingMore');
  try {
    const added = await fetchListPage(view, { reset: false });
    if (state.view !== view) return;
    renderTopbar();
    appendListRows(added);
  } catch (err) {
    showToast(err?.message || 'Failed to load more');
    meta.hasMore = false;
    $('list-sentinel')?.remove();
  } finally {
    meta.loadingMore = false;
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
    const htmlKey = slug ? `${slug}:${number}` : '';
    const htmlPromise =
      htmlKey && (force || !htmlBundleCache.has(htmlKey))
        ? gh.fetchRenderedHtmlBundle({ repo: slug, number, isPr: view === 'prs' }).catch(() => null)
        : Promise.resolve(htmlBundleCache.get(htmlKey) || null);

    if (view === 'prs') {
      const [detail, checks, bundle] = await Promise.all([
        gh.getPrDetail({ repo: slug, number }),
        gh.getPrChecks({ repo: slug, number }).catch(() => []),
        htmlPromise,
      ]);
      if (bundle && htmlKey) {
        htmlBundleCache.set(htmlKey, bundle);
        signedUrlCache.set(htmlKey, bundle.signedImageMap);
      }
      if (detail) state.detailCache.set(key, detail);
      if (checks.length > 0) {
        state.checksCache.set(number, checks);
      } else if (Array.isArray(detail?.statusCheckRollup)) {
        state.checksCache.set(number, detail.statusCheckRollup);
      }
    } else {
      const [detail, bundle] = await Promise.all([gh.getIssueDetail({ repo: slug, number }), htmlPromise]);
      if (bundle && htmlKey) {
        htmlBundleCache.set(htmlKey, bundle);
        signedUrlCache.set(htmlKey, bundle.signedImageMap);
      }
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
    state.diffCache.set(number, {
      diff: res.diff,
      parsed: parseUnifiedDiff(res.diff),
      truncated: res.truncated,
    });
  } catch (err) {
    state.diffCache.set(number, { diff: '', parsed: [], truncated: false, error: err?.message });
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

function formatTabCount(view) {
  const items = view === 'prs' ? state.prs : state.issues;
  const meta = state.listMeta[view];
  if (meta?.totalCount != null) return String(meta.totalCount);
  if (!meta?.loaded && items.length === 0 && !state.preview) return '–';
  return meta?.hasMore ? `${items.length}+` : String(items.length);
}

function renderTopbar() {
  $('pr-count').textContent = formatTabCount('prs');
  $('issue-count').textContent = formatTabCount('issues');

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

function renderListRowHtml(item) {
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
}

function updateListSelection(number) {
  const listEl = $('item-list');
  if (!listEl) return;
  listEl.querySelector('.list-row.selected')?.classList.remove('selected');
  if (number != null) {
    listEl.querySelector(`.list-row[data-number="${CSS.escape(String(number))}"]`)?.classList.add('selected');
  }
}

function observeListSentinel() {
  if (listObserver) {
    listObserver.disconnect();
    listObserver = null;
  }
  const sentinel = $('list-sentinel');
  const root = $('item-list');
  if (!sentinel || !root || typeof IntersectionObserver === 'undefined') return;
  listObserver = new IntersectionObserver(
    entries => {
      if (entries.some(e => e.isIntersecting)) {
        loadMoreCurrentList();
      }
    },
    { root, rootMargin: '160px', threshold: 0.01 },
  );
  listObserver.observe(sentinel);
}

function appendListRows(addedItems) {
  const listEl = $('item-list');
  const sentinel = $('list-sentinel');
  if (!listEl) return;
  if (addedItems.length > 0) {
    const html = addedItems.map(renderListRowHtml).join('');
    if (sentinel) sentinel.insertAdjacentHTML('beforebegin', html);
    else listEl.insertAdjacentHTML('beforeend', html);
  }
  const meta = state.listMeta[state.view];
  if (!meta?.hasMore) {
    sentinel?.remove();
    if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }
  } else if (sentinel) {
    sentinel.textContent = t('loadingMore');
  }
}

function renderList() {
  const listEl = $('item-list');
  const items = filteredPreviewItems(activeItems());
  const meta = state.listMeta[state.view];
  if (items.length === 0) {
    if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }
    listEl.innerHTML = `<p class="empty-inline" style="padding:12px">${esc(
      state.loadingList ? t('syncing') : state.view === 'prs' ? t('emptyPrList') : t('emptyIssueList'),
    )}</p>`;
    return;
  }

  const sentinelHtml =
    !state.preview && meta?.hasMore ? `<div class="lazy-sentinel" id="list-sentinel">${esc(t('loadingMore'))}</div>` : '';
  listEl.innerHTML = items.map(renderListRowHtml).join('') + sentinelHtml;
  observeListSentinel();
}

async function launchBuiltInTerminalCommand(command, label) {
  state.envActionError = '';
  const run = window.deck?.terminal?.run;
  if (typeof run !== 'function') {
    state.envActionError = t('errTerminalUnsupported');
    renderEnvError();
    return;
  }
  const btn = $('env-terminal-run');
  if (btn) btn.disabled = true;
  try {
    await run(command, { label, appendEnter: true, closeDeck: true });
  } catch (err) {
    const msg = String(err?.message || err || '');
    const lower = msg.toLowerCase();
    if (lower.includes('declined') || lower.includes('cancelled') || lower.includes('permissiondenied')) {
      state.envActionError = t('errTerminalDeclined');
    } else if (lower.includes('notimplemented') || lower.includes('unsupported')) {
      state.envActionError = t('errTerminalUnsupported');
    } else {
      state.envActionError = t('errTerminalFailed', { detail: msg || 'unknown error' });
    }
    renderEnvError();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderEnvError() {
  const err = state.envError;
  const code = err?.code || 'CLI_ERROR';
  let title = t('envNotRepoTitle');
  let desc = err?.message || t('envNotRepoDesc');
  let cmd = '';
  let terminalLabel = '';
  let terminalBtnText = '';
  let docUrl = '';

  if (code === 'GH_NOT_FOUND') {
    title = t('envGhMissingTitle');
    const plan = state.installPlan;
    if (plan && plan.supported && plan.command) {
      desc = t('envGhMissingDesc');
      cmd = plan.command;
      terminalLabel = 'Install gh';
      terminalBtnText = t('btnInstallGhInTerminal');
    } else if (plan && !plan.supported) {
      desc = plan.reason === 'missing_pkg_manager' ? t('envMissingPkgManager') : t('envUnsupportedPlatform');
      docUrl = plan.docUrl || 'https://cli.github.com';
    } else {
      desc = t('envGhMissingDesc');
      cmd = 'brew install gh';
      terminalLabel = 'Install gh';
      terminalBtnText = t('btnInstallGhInTerminal');
      docUrl = 'https://cli.github.com';
    }
  } else if (code === 'GH_NOT_AUTHED') {
    title = t('envGhAuthTitle');
    desc = t('envGhAuthDesc');
    cmd = 'gh auth login';
    terminalLabel = 'gh auth login';
    terminalBtnText = t('btnAuthGhInTerminal');
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
    ${state.envActionError ? `<div class="inote err" role="alert" style="max-width:440px;margin:4px 0">${esc(state.envActionError)}</div>` : ''}
    <div class="empty-actions">
      ${terminalBtnText && cmd ? `<button type="button" class="btn primary" id="env-terminal-run">${esc(terminalBtnText)}</button>` : ''}
      ${docUrl ? `<button type="button" class="btn ${terminalBtnText && cmd ? '' : 'primary'}" id="env-install-guide">${esc(t('btnOpenInstallGuide'))}</button>` : ''}
      <button type="button" class="btn ${terminalBtnText && cmd ? '' : docUrl ? '' : 'primary'}" id="env-retry">${esc(t('retryBtn'))}</button>
      <button type="button" class="btn" id="env-settings">${esc(t('openSettingsBtn'))}</button>
    </div>
  `;
  $('env-terminal-run')?.addEventListener('click', () => launchBuiltInTerminalCommand(cmd, terminalLabel));
  $('env-install-guide')?.addEventListener('click', () => openExternalUrl(docUrl));
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
      ${isOpen ? `<button type="button" class="btn" data-act="worktree">${esc(t('actCreateWorktree'))}</button>` : ''}
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
      <button type="button" class="btn" data-act="worktree">${esc(t('actCreateWorktree'))}</button>
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

  state.activeTimeline = null;
  state.activeDiffRender = null;
  if (detailScrollObserver) {
    detailScrollObserver.disconnect();
    detailScrollObserver = null;
  }

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
      const parsed = Array.isArray(diffEntry.parsed) ? diffEntry.parsed : parseUnifiedDiff(diffEntry.diff);
      if (!Array.isArray(diffEntry.parsed)) diffEntry.parsed = parsed;
      state.activeDiffRender = {
        number: item.number,
        files: parsed,
        renderedCount: Math.min(DIFF_FILES_BATCH, parsed.length),
      };
      bodyHtml = renderDiffFiles(parsed, item.files || [], diffEntry.truncated, { limit: DIFF_FILES_BATCH });
    }
  }

  paneEl.innerHTML = `
    <header class="detail-head">
      <div class="dh-mobile-bar">
        <button type="button" class="btn sm mobile-list-btn" data-act="open-rail">← ${esc(t('backToList'))}</button>
      </div>
      <div class="dh-top">
        <div class="dh-title-wrap">
          <h2 class="dh-title">${esc(item.title)}<span class="dh-num mono">#${item.number}</span></h2>
          <div class="dh-meta">
            <span class="pill ${stInfo.cls === 'open' ? 'done' : stInfo.cls === 'closed' ? 'drift' : stInfo.cls === 'draft' ? 'gate' : 'merged'}">
              <span class="sdot ${stInfo.cls}"></span>${esc(stInfo.label)}
            </span>
            ${renderAvatar(author, avatarCache)}
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
    <div class="detail-scroll" id="detail-scroll">${bodyHtml}</div>
  `;
  setupDetailScrollObserver();
  hydrateMediaInDom(paneEl);
}

function renderTimelineCardHtml(entry) {
  const badge =
    entry.kind === 'review' && entry.state
      ? `<span class="pill ${entry.state === 'APPROVED' ? 'done' : entry.state === 'CHANGES_REQUESTED' ? 'drift' : ''}">${esc(entry.state)}</span>`
      : '';
  return `
    <div class="comment-card">
      <div class="comment-head">
        ${renderAvatar(entry.author, avatarCache)}
        <span class="comment-author">${esc(entry.author)}</span>
        ${badge}
        <span class="comment-time">${esc(formatRelTime(entry.at))}</span>
      </div>
      ${renderRichBody(entry.body || '', entry.bodyHtml, imageCache)}
    </div>
  `;
}

function setupDetailScrollObserver() {
  if (detailScrollObserver) {
    detailScrollObserver.disconnect();
    detailScrollObserver = null;
  }
  const scrollRoot = $('detail-scroll');
  if (!scrollRoot || typeof IntersectionObserver === 'undefined') return;
  const commentsSentinel = $('comments-sentinel');
  const diffSentinel = $('diff-sentinel');
  if (!commentsSentinel && !diffSentinel) return;

  detailScrollObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (entry.target.id === 'comments-sentinel') {
          loadMoreTimelineEntries();
        } else if (entry.target.id === 'diff-sentinel') {
          appendMoreDiffFiles();
        }
      }
    },
    { root: scrollRoot, rootMargin: '260px', threshold: 0.01 },
  );
  if (commentsSentinel) detailScrollObserver.observe(commentsSentinel);
  if (diffSentinel) detailScrollObserver.observe(diffSentinel);
}

async function loadMoreTimelineEntries() {
  const tl = state.activeTimeline;
  const listEl = $('timeline-list');
  const sentinel = $('comments-sentinel');
  if (!tl || !listEl || tl.loadingMore) return;

  if (tl.renderedCount < tl.items.length) {
    const slice = tl.items.slice(tl.renderedCount, tl.renderedCount + COMMENTS_BATCH_SIZE);
    tl.renderedCount += slice.length;
    const temp = document.createElement('div');
    temp.innerHTML = slice.map(renderTimelineCardHtml).join('');
    while (temp.firstChild) listEl.appendChild(temp.firstChild);
    hydrateMediaInDom(listEl);
    if (tl.renderedCount >= tl.items.length && !tl.remoteHasMore) {
      sentinel?.remove();
    }
    return;
  }

  if (!tl.remoteHasMore || state.preview || !tl.repo) {
    sentinel?.remove();
    return;
  }

  tl.loadingMore = true;
  if (sentinel) sentinel.textContent = t('loadingMore');
  try {
    const nextPage = tl.remotePage + 1;
    const page = await gh.fetchIssueCommentsPage({ repo: tl.repo, number: tl.number, page: nextPage, perPage: 50 });
    if (state.activeTimeline !== tl) return;
    tl.remotePage = nextPage;
    tl.remoteHasMore = page.hasMore;
    const signedKey = `${tl.repo}:${tl.number}`;
    if (page.signedImageMap.size > 0) {
      const existingMap = signedUrlCache.get(signedKey) || new Map();
      for (const [k, v] of page.signedImageMap.entries()) existingMap.set(k, v);
      signedUrlCache.set(signedKey, existingMap);
    }
    const existingKeys = new Set(tl.items.map(x => `${x.kind}|${x.author}|${x.at}`));
    const fresh = page.items.filter(x => !existingKeys.has(`${x.kind}|${x.author}|${x.at}`));
    if (fresh.length > 0) {
      tl.items.push(...fresh);
      const slice = fresh.slice(0, COMMENTS_BATCH_SIZE);
      tl.renderedCount += slice.length;
      const temp = document.createElement('div');
      temp.innerHTML = slice.map(renderTimelineCardHtml).join('');
      while (temp.firstChild) listEl.appendChild(temp.firstChild);
      hydrateMediaInDom(listEl);
      const headEl = $('comments-section-head');
      if (headEl) headEl.textContent = `${t('commentsTitle')} (${tl.items.length})`;
    }
    if (tl.renderedCount >= tl.items.length && !tl.remoteHasMore) {
      sentinel?.remove();
    }
  } catch {
    tl.remoteHasMore = false;
    sentinel?.remove();
  } finally {
    tl.loadingMore = false;
  }
}

function appendMoreDiffFiles() {
  const dr = state.activeDiffRender;
  const listEl = $('diff-files-list');
  const sentinel = $('diff-sentinel');
  if (!dr || !listEl) return;
  if (dr.renderedCount >= dr.files.length) {
    sentinel?.remove();
    return;
  }
  const end = Math.min(dr.files.length, dr.renderedCount + DIFF_FILES_BATCH);
  let html = '';
  for (let i = dr.renderedCount; i < end; i++) {
    html += renderDiffFileCard(dr.files[i], i);
  }
  dr.renderedCount = end;
  listEl.insertAdjacentHTML('beforeend', html);
  if (dr.renderedCount >= dr.files.length) {
    sentinel?.remove();
  }
}

function renderOverviewTab(item, isPr, checkSum) {
  const slug = repoSlug();
  const bundle = slug && item?.number != null ? htmlBundleCache.get(`${slug}:${item.number}`) : null;
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const reviews = isPr && Array.isArray(item.reviews) ? item.reviews.filter(r => r.body || r.state !== 'COMMENTED') : [];
  const timeline = [
    ...comments.map(c => {
      const author = c.author?.login || 'ghost';
      const bodyHtml =
        bundle?.commentHtmlByKey.get(`${author}|${c.createdAt || ''}`) ||
        (c.url ? bundle?.commentHtmlByKey.get(c.url) : '') ||
        '';
      return { kind: 'comment', author, at: c.createdAt, body: c.body, bodyHtml, state: '' };
    }),
    ...reviews.map(r => {
      const author = r.author?.login || 'ghost';
      const bodyHtml = bundle?.reviewHtmlByKey.get(`${author}|${r.submittedAt || ''}`) || '';
      return { kind: 'review', author, at: r.submittedAt, body: r.body, bodyHtml, state: r.state };
    }),
  ].sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));

  const initialSlice = timeline.slice(0, COMMENTS_BATCH_SIZE);
  const remoteHasMore = Boolean(!state.preview && bundle?.commentsHasMore);
  state.activeTimeline = {
    key: detailKey(state.view, item.number),
    repo: slug,
    number: item.number,
    items: timeline,
    renderedCount: initialSlice.length,
    loadingMore: false,
    remotePage: bundle?.commentsPage || 1,
    remoteHasMore,
  };

  const hasMoreTimeline = timeline.length > initialSlice.length || remoteHasMore;
  const timelineHtml =
    timeline.length > 0
      ? `<div id="timeline-list">${initialSlice.map(renderTimelineCardHtml).join('')}</div>${
          hasMoreTimeline ? `<div class="lazy-sentinel" id="comments-sentinel">${esc(t('loadingMore'))}</div>` : ''
        }`
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
        <div class="card">${renderRichBody(item.body, bundle?.bodyHtml || '', imageCache)}</div>
        <div class="section-head" id="comments-section-head">${esc(t('commentsTitle'))} (${timeline.length}${remoteHasMore ? '+' : ''})</div>
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
          <button type="button" class="btn sm soft" id="btn-ai-create-pr">✨ ${esc(t('btnAiCreatePr'))}</button>
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

  $('btn-ai-create-pr')?.addEventListener('click', handleAiCreatePr);
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

async function handleAiCreatePr() {
  if (!window.deck?.agent?.run) return;
  const base = $('pr-base-input')?.value.trim() || state.env?.defaultBranch || 'main';
  const draft = Boolean($('pr-draft-check')?.checked);
  const prompt = t('promptCreatePr', {
    base,
    draft: draft ? t('promptDraftModifier') : '',
  });
  closeModal();
  showToast(t('toastSessionStarted'));
  try {
    await window.deck.agent.run({
      prompt,
      focus: true,
      wait: false,
      dedupe: 'running',
      ...agentOverridesPayload(),
    });
  } catch (err) {
    showToast(err?.message || 'Failed to launch Agent');
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

function openCreateWorktreeModal(item, isPr) {
  if (guardPreview()) return;
  const defaultBranch = isPr ? `pr-${item.number}` : `issue-${item.number}`;
  const base = state.env?.defaultBranch || 'main';
  const hint = isPr
    ? t('fieldWorktreeHintPr', { n: item.number, head: item.headRefName || '' })
    : t('fieldWorktreeHintIssue', { n: item.number, base });

  openModal(`
    <div class="modal-head">
      <h3>${esc(t('modalWorktreeTitle'))}</h3>
      <button type="button" class="ico" data-close-modal>✕</button>
    </div>
    <div class="modal-body">
      <p style="margin:0;color:var(--muted);font-size:12px">${esc(hint)}</p>
      <div class="field">
        <span class="field-label">${esc(t('fieldBranchName'))}</span>
        <input type="text" class="input mono" id="wt-branch-input" value="${esc(defaultBranch)}" />
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn" data-close-modal>${esc(t('btnCancel'))}</button>
      <button type="button" class="btn primary" id="btn-confirm-worktree">${esc(t('btnCreateWorktree'))}</button>
    </div>
  `);

  $('btn-confirm-worktree')?.addEventListener('click', async () => {
    const branch = $('wt-branch-input').value.trim();
    if (!branch) return;
    const btn = $('btn-confirm-worktree');
    btn.disabled = true;
    try {
      // Use native deck.worktree.create if exposed by host, otherwise invoke Lumzel's built-in worktree_create MCP via Agent.
      if (typeof window.deck?.worktree?.create === 'function') {
        await window.deck.worktree.create({ branch, base: isPr ? item.headRefName || base : base });
        closeModal();
        showToast(t('toastWorktreeCreated', { branch }));
        return;
      }
      const prompt = isPr
        ? t('promptCreateWorktreePr', {
            repo: repoSlug(),
            n: item.number,
            title: item.title,
            head: item.headRefName || '',
            branch,
          })
        : t('promptCreateWorktreeIssue', {
            repo: repoSlug(),
            n: item.number,
            title: item.title,
            base,
            branch,
          });
      closeModal();
      showToast(t('toastWorktreeStarted'));
      const key = detailKey(state.view, item.number);
      const label = `${t('actCreateWorktree')} (${branch})`;
      state.sessions[key] = { sessionId: '', status: 'running', label };
      renderDetail();
      const res = await window.deck.agent.run({
        prompt,
        focus: false,
        wait: false,
        dedupe: 'running',
        dedupeKey: `${key}:worktree:${branch}`,
        ...agentOverridesPayload(),
      });
      if (res?.sessionId) {
        state.sessions[key] = { sessionId: res.sessionId, status: res.status || 'running', label };
        renderDetail();
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create worktree');
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
    setRailCollapsed(!state.railCollapsed);
  });

  $('rail-scrim')?.addEventListener('click', () => {
    setRailCollapsed(true);
  });

  $('btn-empty-open-list')?.addEventListener('click', () => {
    setRailCollapsed(false);
  });

  narrowMq?.addEventListener?.('change', () => {
    syncRailScrim();
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
      if (!state.preview && !state.listMeta[next]?.loaded) {
        refreshCurrentList();
      } else if (state.selectedNumber != null) {
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
    if (isNarrowScreen()) setRailCollapsed(true);
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
    if (num === state.selectedNumber) {
      if (isNarrowScreen()) setRailCollapsed(true);
      return;
    }
    state.selectedNumber = num;
    state.subtab = 'overview';
    state.activeMenuOpen = false;
    updateListSelection(num);
    if (isNarrowScreen()) setRailCollapsed(true);
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
    const diffMoreBtn = e.target.closest('[data-diff-more]');
    if (diffMoreBtn) {
      const fileIdx = Number(diffMoreBtn.dataset.diffMore);
      const offset = Number(diffMoreBtn.dataset.diffOffset) || 0;
      const file = state.activeDiffRender?.files?.[fileIdx];
      if (file) {
        const chunkHtml = renderDiffLinesSlice(file.lines, offset, DIFF_MORE_LINES);
        const wrap = diffMoreBtn.closest('.diff-more-wrap');
        if (wrap) {
          wrap.insertAdjacentHTML('beforebegin', chunkHtml);
          const nextOffset = offset + DIFF_MORE_LINES;
          const remaining = file.lines.length - nextOffset;
          if (remaining > 0) {
            diffMoreBtn.dataset.diffOffset = String(nextOffset);
            diffMoreBtn.textContent = t('loadMoreLines', { n: remaining });
          } else {
            wrap.remove();
          }
        }
      }
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
    if (act === 'open-rail') {
      setRailCollapsed(false);
      return;
    }
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
    } else if (act === 'worktree') {
      openCreateWorktreeModal(item, state.view === 'prs');
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
      if (isNarrowScreen() && !state.railCollapsed) {
        setRailCollapsed(true);
      }
    }
  });
}

boot();
