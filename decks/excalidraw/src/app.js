import { applyI18n, getLocale, normalizeLocale, setLocale, t } from './i18n.js';
import { buildPreviewSamples, buildTemplateScene } from './sample.js';
import {
  getUiSelectValue,
  initUiSelect,
  isSelectMenuOwnedBy,
  setUiSelectOptions,
  setUiSelectValue,
} from './uiSelect.js';
let excalidrawMod = null;
let excalidrawModPromise = null;
function getExcalidraw() {
  if (excalidrawMod) return Promise.resolve(excalidrawMod);
  if (!excalidrawModPromise) {
    excalidrawModPromise = import('../vendor/excalidraw.js').then(mod => {
      excalidrawMod = mod;
      return mod;
    });
  }
  return excalidrawModPromise;
}

const $ = id => document.getElementById(id);

const SKIP_SCAN_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'target',
  'out',
  'vendor',
  'loadouts',
  '.git',
  '.lumzel',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  'site-packages',
  'Pods',
  'DerivedData',
  'tmp',
  'logs',
  '.parcel-cache',
  '.vite',
  '.svelte-kit',
  '.output',
  '.pytest_cache',
  '.mypy_cache',
  '__pycache__',
  'coverage',
]);

const DIAGRAM_EXT_RE = /\.(excalidraw|excalidraw\.json)$/i;

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
  hasProject: true,
  theme: 'light',
  locale: 'en',
  view: 'canvas', // canvas | files | json
  files: [], // [{ path, name, title, size, modifiedAt, scene? }]
  activePath: '',
  activeScene: null,
  sceneCache: new Map(), // path -> parsed scene
  thumbCache: new Map(), // path -> { key, svgMarkup, stats }
  filterText: '',
  dirty: false,
  saving: false,
  lastSavedSignature: '',
  suppressChangeUntil: 0,
  excalidrawHost: null,
  excalidrawApi: null,
  pendingLoadScene: null,
  params: { defaultDir: 'diagrams', defaultDiagramType: 'auto', autoSave: true },
  agentCatalog: null,
  selectedAgent: { provider: '', model: '', effort: '' },
  agentMenuOpen: false,
  runs: [], // [{ sessionId, targetPath, mode, diagramType, status, updatedAt }]
  narrowDrawer: '',
  previewModalPath: '',
  renameTargetPath: '',
  deleteTargetPath: '',
};

let autoSaveTimer = 0;
let toastTimer = 0;
let pollRunsTimer = 0;
let agentSubscribed = false;
let galleryRenderToken = 0;
let mountToken = 0;

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

function isDiagramPath(p) {
  return DIAGRAM_EXT_RE.test(String(p || ''));
}

function getDefaultDir() {
  return String(state.params.defaultDir ?? 'diagrams')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
}

function normalizeRelPath(raw) {
  let clean = String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!clean) return '';
  if (!isDiagramPath(clean)) clean += '.excalidraw';
  return clean;
}

function resolveDiagramPathFromId(rawId) {
  const clean = String(rawId || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!clean) return '';
  if (clean.includes('/')) return normalizeRelPath(clean);
  const dir = getDefaultDir();
  return normalizeRelPath(dir ? `${dir}/${clean}` : clean);
}

function generateAutoDiagramPath(prefix = 'diagram') {
  const dir = getDefaultDir();
  const base = String(prefix || 'diagram')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'diagram';
  const existing = new Set(state.files.map(f => f.path));
  let n = 1;
  while (n < 10000) {
    const candidate = normalizeRelPath(dir ? `${dir}/${base}-${n}` : `${base}-${n}`);
    if (!existing.has(candidate)) return candidate;
    n += 1;
  }
  return normalizeRelPath(dir ? `${dir}/${base}-${Date.now().toString(36).slice(-4)}` : `${base}-${Date.now().toString(36).slice(-4)}`);
}

function displayTitleFromPath(p) {
  const base = String(p || '').split('/').pop() || 'untitled';
  return base.replace(/\.(excalidraw|excalidraw\.json)$/i, '') || base;
}

function computeSceneSignature(elements, appState, files) {
  const list = elements || [];
  let activeCount = 0;
  let version = 0;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (item) {
      if (!item.isDeleted) activeCount += 1;
      version += item.version || 1;
    }
  }
  const bg = appState?.viewBackgroundColor || '#ffffff';
  let fileKeys = '';
  if (files) {
    const keys = Object.keys(files);
    if (keys.length) fileKeys = keys.sort().join(',');
  }
  return `${version}:${activeCount}:${bg}:${fileKeys}`;
}

function computeSceneStats(scene) {
  const elements = (scene?.elements || []).filter(item => !item?.isDeleted);
  const shapes = elements.filter(item => ['rectangle', 'ellipse', 'diamond', 'frame'].includes(item.type)).length;
  const arrows = elements.filter(item => item.type === 'arrow' || item.type === 'line').length;
  const texts = elements.filter(item => item.type === 'text').length;
  return { elements: elements.length, shapes, arrows, texts };
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return state.locale === 'zh-CN' ? '刚刚' : 'just now';
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return state.locale === 'zh-CN' ? `${mins} 分钟前` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return state.locale === 'zh-CN' ? `${hrs} 小时前` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return state.locale === 'zh-CN' ? `${days} 天前` : `${days}d ago`;
}

function excalidrawLangCode() {
  return state.locale === 'zh-CN' ? 'zh-CN' : 'en';
}

async function parseDiagramJson(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.elements)) {
    throw new Error('Expected Excalidraw JSON object with "elements" array');
  }
  const { restore } = await getExcalidraw();
  const restored = restore(
    {
      elements: parsed.elements || [],
      appState: parsed.appState || {},
      files: parsed.files || {},
    },
    null,
    null,
    { refreshDimensions: false, repairBindings: true },
  );
  return {
    type: 'excalidraw',
    version: 2,
    source: parsed.source || 'https://excalidraw.com',
    elements: restored.elements || [],
    appState: {
      viewBackgroundColor: parsed.appState?.viewBackgroundColor || '#ffffff',
      gridSize: parsed.appState?.gridSize ?? 20,
      ...restored.appState,
    },
    files: restored.files || {},
  };
}

function applyTheme(next) {
  state.theme = next === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  if (state.excalidrawHost) {
    state.excalidrawHost.setTheme(state.theme);
  }
  if (state.view === 'files') {
    renderGallery();
  }
}

function syncActiveFileHeader() {
  const pathEl = $('active-file-path');
  const badgeEl = $('save-state-badge');
  const jsonPathEl = $('json-path');
  const hasActive = Boolean(state.activePath);
  if (pathEl) {
    pathEl.textContent = state.activePath || '';
    pathEl.hidden = !hasActive;
  }
  if (badgeEl) {
    badgeEl.hidden = !hasActive;
  }
  if (jsonPathEl) {
    jsonPathEl.textContent = state.activePath || '';
    jsonPathEl.hidden = !hasActive;
  }
}

function updateSaveBadge() {
  const badge = $('save-state-badge');
  if (!badge) return;
  badge.hidden = !state.activePath;
  if (state.saving) {
    badge.dataset.state = 'saving';
    badge.textContent = t('savingState');
  } else if (state.dirty) {
    badge.dataset.state = 'unsaved';
    badge.textContent = t('unsavedState');
  } else {
    badge.dataset.state = 'saved';
    badge.textContent = t('savedState');
  }
}

function setNarrowDrawer(drawer) {
  state.narrowDrawer = drawer || '';
  const pane = $('view-canvas');
  const scrim = $('drawer-scrim');
  const toggleBtn = $('btn-toggle-rail');
  if (state.narrowDrawer) {
    pane.dataset.drawer = state.narrowDrawer;
    scrim.hidden = false;
    toggleBtn?.setAttribute('aria-expanded', 'true');
  } else {
    delete pane.dataset.drawer;
    scrim.hidden = true;
    toggleBtn?.setAttribute('aria-expanded', 'false');
  }
}

function switchView(nextView) {
  state.view = nextView;
  for (const tab of document.querySelectorAll('.main-tab')) {
    tab.classList.toggle('on', tab.dataset.view === nextView);
  }
  $('view-canvas').hidden = nextView !== 'canvas';
  $('view-files').hidden = nextView !== 'files';
  $('view-json').hidden = nextView !== 'json';
  setNarrowDrawer('');

  if (nextView === 'canvas') {
    requestAnimationFrame(() => {
      state.excalidrawApi?.refresh?.();
    });
  } else if (nextView === 'files') {
    renderGallery();
  } else if (nextView === 'json') {
    void syncJsonEditorFromCanvas();
  }
}

function getLiveSceneData() {
  if (state.excalidrawApi) {
    const elements = state.excalidrawApi.getSceneElements();
    const appState = state.excalidrawApi.getAppState();
    const files = state.excalidrawApi.getFiles();
    return { elements, appState, files };
  }
  const fallback = state.activeScene || buildTemplateScene('blank', state.locale);
  return {
    elements: fallback.elements || [],
    appState: fallback.appState || { viewBackgroundColor: '#ffffff' },
    files: fallback.files || {},
  };
}

async function serializeSceneJson(elements, appState, files) {
  const { serializeAsJSON } = await getExcalidraw();
  return serializeAsJSON(elements, appState, files, 'local');
}

async function syncJsonEditorFromCanvas() {
  const { elements, appState, files } = getLiveSceneData();
  syncActiveFileHeader();
  const stats = computeSceneStats({ elements });
  $('json-stats').textContent = t('jsonStats', stats);
  let jsonText;
  if (excalidrawMod) {
    jsonText = excalidrawMod.serializeAsJSON(elements, appState, files, 'local');
  } else {
    $('btn-apply-json').disabled = true;
    try {
      jsonText = await serializeSceneJson(elements, appState, files);
    } finally {
      $('btn-apply-json').disabled = false;
    }
  }
  if (state.view === 'json') {
    $('json-editor').value = jsonText;
  }
}

async function mountOrUpdateCanvas(scene) {
  const token = ++mountToken;
  const mountEl = $('excalidraw-mount');
  const normalized = {
    elements: scene.elements || [],
    appState: {
      viewBackgroundColor: scene.appState?.viewBackgroundColor || '#ffffff',
      gridSize: scene.appState?.gridSize ?? 20,
      theme: state.theme,
    },
    files: scene.files || {},
  };

  state.suppressChangeUntil = Date.now() + 400;
  state.lastSavedSignature = computeSceneSignature(normalized.elements, normalized.appState, normalized.files);
  state.dirty = false;
  updateSaveBadge();

  const { CaptureUpdateAction, mountExcalidraw } = await getExcalidraw();
  if (token !== mountToken) return;

  if (!state.excalidrawHost) {
    state.pendingLoadScene = normalized;
    state.excalidrawHost = mountExcalidraw(mountEl, {
      initialData: {
        elements: normalized.elements,
        appState: normalized.appState,
        files: normalized.files,
        scrollToContent: true,
      },
      theme: state.theme,
      langCode: excalidrawLangCode(),
      onReady: api => {
        state.excalidrawApi = api;
        if (state.pendingLoadScene && state.pendingLoadScene.elements.length > 0) {
          requestAnimationFrame(() => {
            api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: false });
          });
        }
        state.pendingLoadScene = null;
      },
      onChange: (elements, appState, files) => {
        if (Date.now() < state.suppressChangeUntil) return;
        const sig = computeSceneSignature(elements, appState, files);
        if (sig === state.lastSavedSignature) return;
        state.dirty = true;
        updateSaveBadge();
        if (state.params.autoSave && !state.preview && state.activePath && state.hasProject) {
          clearTimeout(autoSaveTimer);
          autoSaveTimer = setTimeout(() => {
            void saveActiveFile({ silent: true });
          }, 900);
        }
      },
    });
    return;
  }

  if (state.excalidrawApi) {
    const fileList = Object.values(normalized.files || {});
    if (fileList.length) {
      state.excalidrawApi.addFiles(fileList);
    }
    state.excalidrawApi.updateScene({
      elements: normalized.elements,
      appState: normalized.appState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    state.excalidrawApi.history?.clear?.();
    requestAnimationFrame(() => {
      state.excalidrawApi?.refresh?.();
      if (normalized.elements.length > 0) {
        state.excalidrawApi?.scrollToContent(normalized.elements, { fitToContent: true, animate: false });
      }
    });
  }
}

async function loadSceneForPath(filePath, { forceReload = false } = {}) {
  if (!forceReload && state.sceneCache.has(filePath)) {
    return state.sceneCache.get(filePath);
  }
  const sampleEntry = state.files.find(f => f.path === filePath && f.scene);
  if (sampleEntry && (state.preview || !state.hasProject)) {
    const restored = await parseDiagramJson(JSON.stringify(sampleEntry.scene));
    state.sceneCache.set(filePath, restored);
    return restored;
  }
  const [res] = await Promise.all([
    window.deck.files.read(filePath, { encoding: 'utf8' }),
    getExcalidraw(),
  ]);
  const parsed = await parseDiagramJson(res.content);
  state.sceneCache.set(filePath, parsed);
  return parsed;
}

async function openFile(filePath, { forceReload = false, switchToCanvas = false, quietOnMissing = false } = {}) {
  if (!filePath) return false;
  if (state.dirty && state.activePath && state.activePath !== filePath && !state.preview && state.hasProject) {
    await saveActiveFile({ silent: true });
  }
  try {
    void getExcalidraw();
    const scene = await loadSceneForPath(filePath, { forceReload });
    state.activePath = filePath;
    state.activeScene = scene;
    syncActiveFileHeader();
    $('empty-canvas').hidden = true;
    $('btn-ai-revise').disabled = false;

    await mountOrUpdateCanvas(scene);
    renderRail();
    if (state.view === 'json') void syncJsonEditorFromCanvas();
    if (switchToCanvas && state.view !== 'canvas') switchView('canvas');

    if (!state.preview && state.hasProject) {
      window.deck.store?.put?.('activePath', filePath).catch(() => {});
    }
    return true;
  } catch (err) {
    if (!quietOnMissing) {
      toast(t('invalidJson', { err: err.message || String(err) }), true);
    }
    return false;
  }
}

async function saveActiveFile({ silent = false } = {}) {
  clearTimeout(autoSaveTimer);
  if (state.preview || !state.hasProject) {
    if (!silent) toast(t('noProjectBanner'), true);
    return false;
  }
  if (!state.activePath) {
    if (!silent) openNewModal();
    return false;
  }

  const { elements, appState, files } = getLiveSceneData();
  const sig = computeSceneSignature(elements, appState, files);
  const jsonText = await serializeSceneJson(elements, appState, files);

  state.saving = true;
  updateSaveBadge();
  try {
    const res = await window.deck.files.write(state.activePath, jsonText, { encoding: 'utf8' });
    state.lastSavedSignature = sig;
    state.dirty = false;
    state.activeScene = await parseDiagramJson(jsonText);
    state.sceneCache.set(state.activePath, state.activeScene);
    state.thumbCache.delete(state.activePath);

    const existing = state.files.find(f => f.path === state.activePath);
    if (existing) {
      existing.size = res.size ?? jsonText.length;
      existing.modifiedAt = Date.now();
      persistFilesCache();
    }
    if (!silent) toast(t('savedMsg', { path: state.activePath }));
    renderRail();
    if (state.view === 'files') renderGallery();
    return true;
  } catch (err) {
    if (!silent) toast(err.message || String(err), true);
    return false;
  } finally {
    state.saving = false;
    updateSaveBadge();
  }
}

function sortFilesList() {
  state.files.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0) || a.path.localeCompare(b.path));
  $('file-count').textContent = String(state.files.length);
  $('toolbar-file-count').textContent = String(state.files.length);
}

function persistFilesCache() {
  if (state.preview || !state.hasProject) return;
  const compact = state.files.slice(0, 200).map(f => ({
    path: f.path,
    name: f.name,
    title: f.title,
    size: f.size || 0,
    modifiedAt: f.modifiedAt || 0,
  }));
  window.deck.store?.put?.('cachedFiles', compact).catch(() => {});
}

function upsertFileEntry(filePath, { size = 0, modifiedAt = Date.now(), scene } = {}) {
  const idx = state.files.findIndex(f => f.path === filePath);
  const entry = {
    path: filePath,
    name: filePath.split('/').pop(),
    title: displayTitleFromPath(filePath),
    size,
    modifiedAt,
    ...(scene ? { scene } : {}),
  };
  if (idx >= 0) state.files[idx] = { ...state.files[idx], ...entry };
  else state.files.unshift(entry);
  sortFilesList();
  persistFilesCache();
}

function removeFileEntry(filePath) {
  state.files = state.files.filter(f => f.path !== filePath);
  sortFilesList();
  persistFilesCache();
}

const QUICK_ROOT_DIAGRAM_DIRS = new Set(['diagrams', 'docs', 'design', 'designs', 'architecture', 'excalidraw']);

async function scanWorkspaceDiagrams({ deep = false } = {}) {
  if (state.preview || !state.hasProject) return;

  const found = [];
  const visited = new Set();
  const queue = [];
  const defaultDir = getDefaultDir();
  if (defaultDir) queue.push({ dir: defaultDir, depth: 1 });
  if (defaultDir !== 'docs') queue.push({ dir: 'docs', depth: 1 });
  queue.push({ dir: '', depth: 0 });

  if (!deep) {
    const knownDirs = new Set();
    if (state.activePath) {
      const idx = state.activePath.lastIndexOf('/');
      if (idx > 0) knownDirs.add(state.activePath.slice(0, idx));
    }
    for (const f of state.files) {
      const idx = f.path.lastIndexOf('/');
      if (idx > 0) knownDirs.add(f.path.slice(0, idx));
    }
    for (const d of knownDirs) {
      if (d !== defaultDir && d !== 'docs' && knownDirs.size <= 10) {
        queue.push({ dir: d, depth: 2 });
      }
    }
  }

  const MAX_DIRS = deep ? 60 : 16;
  const MAX_DEPTH = deep ? 4 : 2;
  const CONCURRENCY = deep ? 3 : 4;

  async function processOne(item) {
    const key = item.dir || '.';
    if (visited.has(key) || visited.size >= MAX_DIRS) return;
    visited.add(key);

    let entries = [];
    try {
      entries = await window.deck.files.list(item.dir || undefined);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDir) {
        const name = entry.name || entry.path.split('/').pop();
        if (!name || name.startsWith('.') || SKIP_SCAN_DIRS.has(name)) continue;
        if (!deep && item.dir === '' && !QUICK_ROOT_DIAGRAM_DIRS.has(name.toLowerCase())) continue;
        if (item.depth < MAX_DEPTH && visited.size + queue.length < MAX_DIRS) {
          queue.push({ dir: entry.path, depth: item.depth + 1 });
        }
      } else if (isDiagramPath(entry.path)) {
        found.push({
          path: entry.path,
          name: entry.name || entry.path.split('/').pop(),
          title: displayTitleFromPath(entry.path),
          size: entry.size || 0,
          modifiedAt: entry.modifiedAt || 0,
        });
      }
    }
  }

  while (queue.length > 0 && visited.size < MAX_DIRS) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(batch.map(processOne));
  }

  const deduped = [];
  const seenPaths = new Set();
  for (const f of found) {
    if (seenPaths.has(f.path)) continue;
    seenPaths.add(f.path);
    deduped.push(f);
  }

  state.files = deduped;
  sortFilesList();
  persistFilesCache();
}

function filteredFiles() {
  const q = state.filterText.trim().toLowerCase();
  if (!q) return state.files;
  return state.files.filter(f => f.path.toLowerCase().includes(q) || f.title.toLowerCase().includes(q));
}

function renderRail() {
  const list = $('rail-file-list');
  const items = filteredFiles();
  $('file-count').textContent = String(state.files.length);
  $('toolbar-file-count').textContent = String(state.files.length);

  if (!items.length) {
    list.replaceChildren(
      el('div', { class: 'hint-sm', style: 'padding: 12px 6px;' }, t('emptyFiles')),
    );
  } else {
    list.replaceChildren(
      ...items.map(file => {
        const active = file.path === state.activePath;
        const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '.';
        return el(
          'button',
          {
            type: 'button',
            class: `file-item${active ? ' on' : ''}`,
            onclick: () => {
              setNarrowDrawer('');
              void openFile(file.path);
            },
          },
          el('span', { class: 'file-item-title' }, file.title),
          el(
            'span',
            { class: 'file-item-sub' },
            el('span', { class: 'file-item-path mono' }, folder),
            el('span', {}, formatRelativeTime(file.modifiedAt)),
          ),
        );
      }),
    );
  }

  renderRecentRuns();
}

function formatRunLabel(run) {
  if (run.targetPath) return displayTitleFromPath(run.targetPath);
  if (run.label) return run.label;
  return t('aiAutoNaming');
}

function renderRecentRuns() {
  const wrap = $('rail-runs');
  const list = $('rail-runs-list');
  if (!state.runs.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  list.replaceChildren(
    ...state.runs.slice(0, 5).map(run => {
      const cls =
        run.status === 'done'
          ? 'ok'
          : run.status === 'error'
            ? 'err'
            : run.status === 'running' || run.status === 'needs_input'
              ? 'brand'
              : '';
      const label =
        run.status === 'done'
          ? t('statusDone')
          : run.status === 'error'
            ? t('statusError')
            : t('statusRunning');
      return el(
        'button',
        {
          type: 'button',
          class: 'run-row',
          onclick: () => {
            if (run.sessionId && !state.preview) {
              window.deck.agent?.open?.(run.sessionId, { closeDeck: false }).catch(() => {});
            }
          },
        },
        el('span', { class: 'run-row-path mono' }, formatRunLabel(run)),
        el('span', { class: `pill ${cls}` }, label),
      );
    }),
  );
  updateAiStatusPill();
}

function updateAiStatusPill() {
  const pill = $('ai-status-pill');
  const running = state.runs.find(r => r.status === 'running' || r.status === 'needs_input');
  if (!running) {
    pill.hidden = true;
    pill.onclick = null;
    return;
  }
  pill.hidden = false;
  $('ai-status-text').textContent = `${t('aiRunningTitle')} ${formatRunLabel(running)}`;
  pill.onclick = () => {
    if (running.sessionId && !state.preview) {
      window.deck.agent?.open?.(running.sessionId, { closeDeck: false }).catch(() => {});
    }
  };
}

async function renderSvgForScene(scene) {
  const { exportToSvg } = await getExcalidraw();
  const svgEl = await exportToSvg({
    elements: (scene.elements || []).filter(item => !item?.isDeleted),
    appState: {
      ...scene.appState,
      exportBackground: true,
      exportWithDarkMode: state.theme === 'dark',
    },
    files: scene.files || {},
    exportPadding: 16,
    skipInliningFonts: true,
  });
  return svgEl;
}

async function hydrateGalleryCardThumb(file, thumbBox, countEl, token) {
  if (token !== galleryRenderToken) return;
  try {
    const scene = await loadSceneForPath(file.path);
    if (token !== galleryRenderToken) return;
    const cacheKey = `${state.theme}:${file.modifiedAt || 0}:${(scene.elements || []).length}`;
    const cached = state.thumbCache.get(file.path);
    let svgMarkup = '';
    let stats = null;

    if (cached && cached.key === cacheKey) {
      svgMarkup = cached.svgMarkup;
      stats = cached.stats;
    } else {
      stats = computeSceneStats(scene);
      if (stats.elements > 0) {
        const svgEl = await renderSvgForScene(scene);
        svgMarkup = svgEl.outerHTML;
      }
      state.thumbCache.set(file.path, { key: cacheKey, svgMarkup, stats });
    }

    if (token !== galleryRenderToken) return;
    if (countEl) {
      countEl.textContent = t('elementsCount', { n: stats.elements });
    }
    if (svgMarkup) {
      thumbBox.innerHTML = svgMarkup;
    } else {
      thumbBox.replaceChildren(el('span', { class: 'card-thumb-empty' }, t('tplBlank')));
    }
  } catch {
    if (token === galleryRenderToken) {
      thumbBox.replaceChildren(el('span', { class: 'card-thumb-empty' }, '—'));
    }
  }
}

function renderGallery() {
  const token = ++galleryRenderToken;
  const grid = $('gallery-grid');
  const emptyEl = $('gallery-empty');
  const items = filteredFiles();
  if (!items.length) {
    grid.replaceChildren();
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const jobs = [];
  const cards = items.map(file => {
    const active = file.path === state.activePath;
    const thumbBox = el('div', {
      class: 'card-thumb',
      onclick: () => void openPreviewModal(file.path),
    }, el('span', { class: 'card-thumb-empty' }, '...'));
    const countPill = el('span', { class: 'count-pill' }, '…');

    const card = el(
      'article',
      { class: `diagram-card${active ? ' active' : ''}` },
      thumbBox,
      el(
        'div',
        { class: 'card-body' },
        el(
          'div',
          { class: 'card-title-row' },
          el('span', { class: 'card-title', title: file.path }, file.title),
          countPill,
        ),
        el('div', { class: 'card-path mono', title: file.path }, file.path),
        el(
          'div',
          { class: 'card-actions' },
          el(
            'button',
            {
              type: 'button',
              class: 'btn sm primary',
              onclick: () => void openFile(file.path, { switchToCanvas: true }),
            },
            t('openOnCanvas'),
          ),
          el(
            'button',
            {
              type: 'button',
              class: 'btn sm',
              onclick: () => void openPreviewModal(file.path),
            },
            t('readOnlyPreview'),
          ),
          !state.preview && state.hasProject
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'btn sm',
                  onclick: () => openRenameModal(file.path),
                },
                t('renameFile'),
              )
            : null,
          !state.preview && state.hasProject
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'btn sm',
                  onclick: () => void duplicateFile(file.path),
                },
                t('duplicateFile'),
              )
            : null,
          !state.preview && state.hasProject
            ? el(
                'button',
                {
                  type: 'button',
                  class: 'btn sm subtle',
                  onclick: () => openDeleteModal(file.path),
                },
                t('deleteFile'),
              )
            : null,
        ),
      ),
    );

    jobs.push({ file, thumbBox, countPill });
    return card;
  });

  grid.replaceChildren(...cards);

  let nextIdx = 0;
  const worker = async () => {
    while (nextIdx < jobs.length && token === galleryRenderToken) {
      const job = jobs[nextIdx++];
      await hydrateGalleryCardThumb(job.file, job.thumbBox, job.countPill, token);
    }
  };
  const workers = Math.min(2, jobs.length);
  for (let i = 0; i < workers; i += 1) {
    void worker();
  }
}

async function openPreviewModal(filePath) {
  state.previewModalPath = filePath;
  $('preview-modal-path').textContent = filePath;
  const stage = $('preview-modal-stage');
  stage.replaceChildren(el('span', { class: 'hint-sm' }, '...'));
  $('preview-modal-stats').textContent = '';
  $('modal-preview').hidden = false;

  try {
    const scene = await loadSceneForPath(filePath);
    const stats = computeSceneStats(scene);
    $('preview-modal-stats').textContent = t('jsonStats', stats);
    if (stats.elements > 0) {
      const svgEl = await renderSvgForScene(scene);
      stage.replaceChildren(svgEl);
    } else {
      stage.replaceChildren(el('span', { class: 'hint-sm' }, t('tplBlank')));
    }
  } catch (err) {
    stage.replaceChildren(el('span', { class: 'err' }, err.message || String(err)));
  }
}

function closePreviewModal() {
  $('modal-preview').hidden = true;
  state.previewModalPath = '';
}

function openNewModal() {
  if (state.preview) {
    toast(t('previewBanner'));
    return;
  }
  void getExcalidraw();
  const dir = getDefaultDir();
  $('new-id').value = '';
  $('new-dir-hint').textContent = t('globalDirHint', { dir: dir || '.' });
  $('new-err').textContent = '';
  setUiSelectValue($('new-template'), 'architecture');
  $('modal-new').hidden = false;
  requestAnimationFrame(() => $('new-id').focus());
}

async function handleCreateNewDiagram() {
  const errEl = $('new-err');
  errEl.textContent = '';
  const tpl = getUiSelectValue($('new-template')) || 'blank';
  const rawId = $('new-id').value.trim();
  const targetPath = rawId
    ? resolveDiagramPathFromId(rawId)
    : generateAutoDiagramPath(tpl === 'blank' ? 'diagram' : tpl);
  if (!targetPath) {
    errEl.textContent = t('diagramIdLabel');
    return;
  }
  if (state.files.some(f => f.path === targetPath)) {
    errEl.textContent = t('fileExistsErr', { path: targetPath });
    return;
  }
  const scene = buildTemplateScene(tpl, state.locale);
  const jsonText = await serializeSceneJson(scene.elements, scene.appState, scene.files || {});

  if (!state.hasProject) {
    upsertFileEntry(targetPath, { size: jsonText.length, modifiedAt: Date.now(), scene });
    $('modal-new').hidden = true;
    await openFile(targetPath, { forceReload: true, switchToCanvas: true });
    return;
  }

  try {
    const res = await window.deck.files.write(targetPath, jsonText, { encoding: 'utf8' });
    $('modal-new').hidden = true;
    upsertFileEntry(targetPath, { size: res?.size ?? jsonText.length, modifiedAt: Date.now() });
    await openFile(targetPath, { forceReload: true, switchToCanvas: true });
    toast(t('savedMsg', { path: targetPath }));
  } catch (err) {
    errEl.textContent = err.message || String(err);
  }
}

function openRenameModal(filePath) {
  state.renameTargetPath = filePath;
  $('rename-label').textContent = t('renamePrompt', { path: filePath });
  $('rename-input').value = filePath;
  $('rename-err').textContent = '';
  $('modal-rename').hidden = false;
  requestAnimationFrame(() => $('rename-input').focus());
}

async function handleConfirmRename() {
  const fromPath = state.renameTargetPath;
  const toPath = normalizeRelPath($('rename-input').value);
  const errEl = $('rename-err');
  errEl.textContent = '';
  if (!toPath || toPath === fromPath) {
    $('modal-rename').hidden = true;
    return;
  }
  if (state.files.some(f => f.path === toPath)) {
    errEl.textContent = t('fileExistsErr', { path: toPath });
    return;
  }
  try {
    const res = await window.deck.files.rename(fromPath, toPath, { overwrite: false });
    $('modal-rename').hidden = true;
    const prev = state.files.find(f => f.path === fromPath);
    state.sceneCache.delete(fromPath);
    state.thumbCache.delete(fromPath);
    removeFileEntry(fromPath);
    upsertFileEntry(toPath, { size: res?.size ?? prev?.size ?? 0, modifiedAt: Date.now() });
    if (state.activePath === fromPath) {
      state.activePath = toPath;
      syncActiveFileHeader();
      window.deck.store?.put?.('activePath', toPath).catch(() => {});
    }
    renderRail();
    if (state.view === 'files') renderGallery();
    toast(t('savedMsg', { path: toPath }));
  } catch (err) {
    errEl.textContent = err.message || String(err);
  }
}

async function duplicateFile(filePath) {
  try {
    const res = await window.deck.files.read(filePath, { encoding: 'utf8' });
    const base = filePath.replace(/\.(excalidraw|excalidraw\.json)$/i, '');
    const ext = filePath.match(/\.(excalidraw|excalidraw\.json)$/i)?.[0] || '.excalidraw';
    let n = 2;
    let candidate = `${base}-copy${ext}`;
    while (state.files.some(f => f.path === candidate)) {
      candidate = `${base}-copy-${n}${ext}`;
      n += 1;
    }
    const writeRes = await window.deck.files.write(candidate, res.content, { encoding: 'utf8' });
    upsertFileEntry(candidate, { size: writeRes?.size ?? res.content.length, modifiedAt: Date.now() });
    renderRail();
    if (state.view === 'files') renderGallery();
    toast(t('savedMsg', { path: candidate }));
  } catch (err) {
    toast(err.message || String(err), true);
  }
}

function openDeleteModal(filePath) {
  state.deleteTargetPath = filePath;
  $('confirm-msg').textContent = t('deleteConfirm', { path: filePath });
  $('modal-confirm').hidden = false;
}

async function handleConfirmDelete() {
  const target = state.deleteTargetPath;
  $('modal-confirm').hidden = true;
  if (!target) return;
  try {
    await window.deck.files.delete(target);
    state.sceneCache.delete(target);
    state.thumbCache.delete(target);
    removeFileEntry(target);
    if (state.activePath === target) {
      state.activePath = '';
      state.dirty = false;
      updateSaveBadge();
      if (state.files.length > 0) {
        await openFile(state.files[0].path);
      } else {
        syncActiveFileHeader();
        $('empty-canvas').hidden = false;
        $('btn-ai-revise').disabled = true;
      }
    }
    renderRail();
    if (state.view === 'files') renderGallery();
    toast(t('deletedMsg', { path: target }));
  } catch (err) {
    toast(err.message || String(err), true);
  }
}

async function handleImportFiles() {
  if (state.preview || !state.hasProject) {
    toast(t('noProjectBanner'), true);
    return;
  }
  try {
    const dir = getDefaultDir() || 'diagrams';
    const res = await window.deck.files.pick({
      dir,
      multiple: true,
      accept: ['.excalidraw', '.excalidraw.json', 'application/json'],
      overwrite: false,
    });
    const picked = Array.isArray(res) ? res : res?.files || [];
    if (!picked.length) return;
    await scanWorkspaceDiagrams();
    await openFile(picked[0].path, { forceReload: true, switchToCanvas: true });
    toast(t('importedMsg', { n: picked.length }));
  } catch (err) {
    toast(err.message || String(err), true);
  }
}

async function handleExport(kind) {
  $('export-menu').hidden = true;
  $('btn-export-menu').setAttribute('aria-expanded', 'false');
  const { elements, appState, files } = getLiveSceneData();
  const baseName = displayTitleFromPath(state.activePath || 'diagram');

  try {
    const { exportToBlob, exportToSvg, serializeAsJSON } = await getExcalidraw();
    if (kind === 'json') {
      const jsonText = serializeAsJSON(elements, appState, files, 'local');
      if (state.preview || !window.deck?.files?.saveAs) {
        downloadFallback(`${baseName}.excalidraw`, new Blob([jsonText], { type: 'application/json' }));
      } else {
        const res = await window.deck.files.saveAs(`${baseName}.excalidraw`, jsonText, { encoding: 'utf8' });
        if (res?.saved) toast(t('exportedMsg', { file: `${baseName}.excalidraw` }));
      }
    } else if (kind === 'png') {
      const blob = await exportToBlob({
        elements: elements.filter(e => !e.isDeleted),
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: state.theme === 'dark',
        },
        files,
        mimeType: 'image/png',
        exportPadding: 24,
      });
      if (state.preview || !window.deck?.files?.saveAs) {
        downloadFallback(`${baseName}.png`, blob);
      } else {
        const res = await window.deck.files.saveAs(`${baseName}.png`, blob);
        if (res?.saved) toast(t('exportedMsg', { file: `${baseName}.png` }));
      }
    } else if (kind === 'svg') {
      const svgEl = await exportToSvg({
        elements: elements.filter(e => !e.isDeleted),
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: state.theme === 'dark',
        },
        files,
        exportPadding: 24,
      });
      const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n${svgEl.outerHTML}`;
      if (state.preview || !window.deck?.files?.saveAs) {
        downloadFallback(`${baseName}.svg`, new Blob([svgText], { type: 'image/svg+xml' }));
      } else {
        const res = await window.deck.files.saveAs(`${baseName}.svg`, svgText, { encoding: 'utf8' });
        if (res?.saved) toast(t('exportedMsg', { file: `${baseName}.svg` }));
      }
    }
  } catch (err) {
    toast(err.message || String(err), true);
  }
}

function downloadFallback(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Agent Catalog & Override Controls */
function getAgentEntry(providerId) {
  const agents = state.agentCatalog?.agents || [];
  return agents.find(a => a.id === providerId) || agents.find(a => a.default) || agents[0] || null;
}

function getEffectiveAgent() {
  const defaults = state.agentCatalog?.defaults || {};
  const provider = state.selectedAgent.provider || defaults.provider || '';
  const agent = getAgentEntry(provider);
  const model = state.selectedAgent.model || defaults.model || agent?.defaultModel || '';
  const modelObj = agent?.models?.find(m => m.id === model) || agent?.models?.[0];
  const efforts = modelObj?.efforts || [];
  const effort = efforts.length
    ? (efforts.includes(state.selectedAgent.effort) ? state.selectedAgent.effort : defaults.effort || modelObj?.defaultEffort || efforts[0])
    : '';
  return {
    provider: agent?.id || provider,
    providerName: agent?.name || provider,
    model: modelObj?.id || model,
    modelName: modelObj?.name || model,
    effort,
    efforts,
    isOverridden: Boolean(state.selectedAgent.provider || state.selectedAgent.model || state.selectedAgent.effort),
  };
}

function syncAgentPickers(prefix = 'ex') {
  const agents = state.agentCatalog?.agents || [];
  const eff = getEffectiveAgent();
  const agentEl = $(`${prefix}-agent-select`) || $(`${prefix}-agent`);
  const modelEl = $(`${prefix}-model-select`) || $(`${prefix}-model`);
  const effortEl = $(`${prefix}-effort-select`) || $(`${prefix}-effort`);
  const effortRow = $(`${prefix}-effort-row`) || $(`${prefix}-effort-field`);

  setUiSelectOptions(
    agentEl,
    agents.map(a => ({ value: a.id, label: a.name })),
    eff.provider,
  );
  const currentAgent = getAgentEntry(eff.provider);
  const models = currentAgent?.models || [];
  setUiSelectOptions(
    modelEl,
    models.map(m => ({ value: m.id, label: m.name })),
    eff.model,
  );
  if (eff.efforts.length) {
    effortRow.hidden = false;
    setUiSelectOptions(
      effortEl,
      eff.efforts.map(e => ({ value: e, label: e })),
      eff.effort,
    );
  } else {
    effortRow.hidden = true;
    setUiSelectOptions(effortEl, [], '');
  }
}

function renderAgentPill() {
  const eff = getEffectiveAgent();
  const pill = $('agent-override-pill');
  const label = $('agent-override-label');
  const badge = $('ex-agent-badge');
  const resetBtn = $('ex-agent-reset');
  const saveDefBtn = $('ex-agent-save-default');
  const hint = $('ex-agent-hint');

  label.textContent = eff.modelName ? `${eff.providerName} · ${eff.modelName}` : eff.providerName || 'Agent';
  pill.classList.toggle('active', eff.isOverridden);
  badge.textContent = eff.isOverridden ? t('agentOverrideBadge') : t('agentDefaultBadge');
  badge.className = `pill${eff.isOverridden ? ' brand' : ''}`;
  resetBtn.hidden = !eff.isOverridden;
  saveDefBtn.hidden = !eff.isOverridden || state.preview;
  hint.textContent = eff.isOverridden ? t('agentHintOverride') : t('agentHintDefault');
}

function setupAgentSelectHandlers(prefix, onChanged) {
  const agentEl = $(`${prefix}-agent-select`) || $(`${prefix}-agent`);
  const modelEl = $(`${prefix}-model-select`) || $(`${prefix}-model`);
  const effortEl = $(`${prefix}-effort-select`) || $(`${prefix}-effort`);

  initUiSelect(agentEl, {
    onChange: val => {
      const entry = getAgentEntry(val);
      const firstModel = entry?.models?.find(m => m.id === entry.defaultModel) || entry?.models?.[0];
      state.selectedAgent = {
        provider: val,
        model: firstModel?.id || '',
        effort: firstModel?.defaultEffort || firstModel?.efforts?.[0] || '',
      };
      onChanged();
    },
  });

  initUiSelect(modelEl, {
    onChange: val => {
      const entry = getAgentEntry(getEffectiveAgent().provider);
      const mObj = entry?.models?.find(m => m.id === val);
      state.selectedAgent = {
        provider: entry?.id || state.selectedAgent.provider,
        model: val,
        effort: mObj?.defaultEffort || mObj?.efforts?.[0] || '',
      };
      onChanged();
    },
  });

  initUiSelect(effortEl, {
    onChange: val => {
      const eff = getEffectiveAgent();
      state.selectedAgent = {
        provider: eff.provider,
        model: eff.model,
        effort: val,
      };
      onChanged();
    },
  });
}

function agentRunOptions() {
  const eff = getEffectiveAgent();
  const opts = {};
  if (eff.provider) opts.provider = eff.provider;
  if (eff.model) opts.model = eff.model;
  if (eff.effort) opts.effort = eff.effort;
  return opts;
}

/* AI Generation & Revision Modal */
function openAiModal(mode = 'create') {
  if (state.preview) {
    toast(t('previewBanner'));
    return;
  }
  const actualMode = mode === 'revise' && state.activePath ? 'revise' : 'create';
  $('ai-err').textContent = '';
  $('modal-ai-h').textContent = actualMode === 'revise' ? t('aiModalReviseTitle') : t('aiModalCreateTitle');
  setUiSelectOptions(
    $('ai-mode'),
    [
      { value: 'create', label: t('aiModeCreate') },
      { value: 'revise', label: t('aiModeRevise'), disabled: !state.activePath },
    ],
    actualMode,
  );
  setUiSelectValue($('ai-type'), state.params.defaultDiagramType || 'auto');

  const dir = getDefaultDir();
  $('ai-id').value = '';
  $('ai-dir-hint').textContent = t('globalDirHint', { dir: dir || '.' });
  $('ai-id-wrap').hidden = actualMode === 'revise';
  $('ai-prompt').value = '';
  $('ai-prompt').setAttribute('placeholder', actualMode === 'revise' ? t('aiPromptRevisePh') : t('aiPromptCreatePh'));

  syncAgentPickers('ai');
  $('modal-ai').hidden = false;
  requestAnimationFrame(() => $('ai-prompt').focus());
}

function buildAiPrompt({ mode, diagramType, targetPath, defaultDir, existingPaths, userPrompt, includeCodebase }) {
  const langInstruction = state.locale === 'zh-CN'
    ? 'Author all diagram labels, titles, and notes in Simplified Chinese (unless code symbols or proper nouns require English).'
    : 'Author all diagram labels, titles, and notes in the same language as the user request.';
  const typeLine = diagramType && diagramType !== 'auto'
    ? `Diagram Type: ${diagramType}`
    : 'Diagram Type: choose the clearest Excalidraw diagram layout for the request.';
  const contextLine = includeCodebase
    ? 'You may inspect relevant files in the workspace so node labels and edges reflect real module names and architecture.'
    : 'Generate directly from the user description without broad codebase scanning unless needed.';

  if (mode === 'revise') {
    return [
      `Revise the existing Excalidraw diagram at \`${targetPath}\`.`,
      typeLine,
      langInstruction,
      contextLine,
      '',
      'Requirements:',
      `- Read \`${targetPath}\` first, preserve existing user layout/elements where appropriate, and write the updated valid Excalidraw v2 JSON back to \`${targetPath}\`.`,
      '- Ensure no overlapping nodes, clear spacing, valid arrow bindings (`startBinding`/`endBinding` + `boundElements`), and `fontFamily: 5`.',
      '',
      `Requested changes:\n${userPrompt}`,
    ].join('\n');
  }

  if (targetPath) {
    return [
      `Create a new Excalidraw diagram file at \`${targetPath}\`.`,
      typeLine,
      langInstruction,
      contextLine,
      '',
      'Requirements:',
      `- Write valid Excalidraw v2 JSON directly to \`${targetPath}\` (create parent directories if needed).`,
      '- Ensure no overlapping nodes, clear spacing, bound text labels (`containerId`), valid arrow bindings (`startBinding`/`endBinding` + `boundElements`), and `fontFamily: 5`.',
      '',
      `Diagram specification:\n${userPrompt}`,
    ].join('\n');
  }

  const dirPrefix = defaultDir ? `${defaultDir}/` : '';
  const avoidLine = existingPaths?.length
    ? `- Avoid overwriting existing files: ${existingPaths.slice(0, 30).map(p => `\`${p}\``).join(', ')}.`
    : '';

  return [
    `Create a new Excalidraw diagram file inside \`${dirPrefix || './'}\`.`,
    typeLine,
    langInstruction,
    contextLine,
    '',
    'Requirements:',
    `- Choose a concise, descriptive kebab-case ID (e.g. \`oauth-token-flow\`, \`order-checkout-arch\`) and save valid Excalidraw v2 JSON to \`${dirPrefix}<id>.excalidraw\` (create parent directories if needed).`,
    avoidLine,
    '- Ensure no overlapping nodes, clear spacing, bound text labels (`containerId`), valid arrow bindings (`startBinding`/`endBinding` + `boundElements`), and `fontFamily: 5`.',
    '',
    `Diagram specification:\n${userPrompt}`,
  ].filter(Boolean).join('\n');
}

function ensureAgentSubscriptions() {
  if (agentSubscribed || state.preview || !window.deck?.agent) return;
  agentSubscribed = true;
  window.deck.agent.onState?.(evt => {
    if (evt?.sessionId && evt?.state) {
      void handleRunStateUpdate(evt.sessionId, evt.state);
    }
  });
  window.deck.agent.onEvent?.('*', evt => {
    if (evt?.sessionId && evt?.status) {
      void handleRunStateUpdate(evt.sessionId, evt.status);
    }
  });
}

function detectAutoCreatedDiagram(run) {
  const before = run.beforeFiles || {};
  const dirPrefix = run.defaultDir ? `${run.defaultDir}/` : '';
  const candidates = state.files.filter(f => {
    if (!(f.path in before)) return true;
    return (f.modifiedAt || 0) > (before[f.path] || 0);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aNew = !(a.path in before) ? 1 : 0;
    const bNew = !(b.path in before) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aInDir = dirPrefix ? (a.path.startsWith(dirPrefix) ? 1 : 0) : 1;
    const bInDir = dirPrefix ? (b.path.startsWith(dirPrefix) ? 1 : 0) : 1;
    if (aInDir !== bInDir) return bInDir - aInDir;
    return (b.modifiedAt || 0) - (a.modifiedAt || 0);
  });
  return candidates[0];
}

async function handleRunStateUpdate(sessionId, nextStatus) {
  const run = state.runs.find(r => r.sessionId === sessionId);
  if (!run) return;
  const normalized =
    nextStatus === 'idle' || nextStatus === 'completed' || nextStatus === 'done'
      ? 'done'
      : nextStatus === 'error' || nextStatus === 'failed'
        ? 'error'
        : nextStatus === 'stopped'
          ? 'stopped'
          : 'running';

  if (run.status === normalized) return;
  run.status = normalized;
  run.updatedAt = Date.now();
  window.deck.store?.put?.('recentRuns', state.runs.slice(0, 12)).catch(() => {});
  renderRail();

  if (normalized === 'done') {
    if (run.targetPath) {
      state.sceneCache.delete(run.targetPath);
      state.thumbCache.delete(run.targetPath);
    }
    await scanWorkspaceDiagrams({ deep: false });
    if (!run.targetPath && run.autoTarget) {
      let matched = detectAutoCreatedDiagram(run);
      if (!matched) {
        await scanWorkspaceDiagrams({ deep: true });
        matched = detectAutoCreatedDiagram(run);
      }
      if (matched) {
        run.targetPath = matched.path;
        window.deck.store?.put?.('recentRuns', state.runs.slice(0, 12)).catch(() => {});
        renderRail();
      }
    }
    if (run.targetPath && state.files.some(f => f.path === run.targetPath)) {
      state.sceneCache.delete(run.targetPath);
      state.thumbCache.delete(run.targetPath);
      await openFile(run.targetPath, { forceReload: true, switchToCanvas: true });
      toast(t('aiDoneMsg', { path: run.targetPath }));
    }
    if (state.view === 'files') renderGallery();
  } else if (normalized === 'error') {
    toast(t('aiFailedMsg', { err: formatRunLabel(run) }), true);
  }
}

function syncRunPoller() {
  const active = state.runs.filter(r => r.status === 'running' || r.status === 'needs_input');
  if (!active.length) {
    clearInterval(pollRunsTimer);
    pollRunsTimer = 0;
    return;
  }
  if (pollRunsTimer) return;
  pollRunsTimer = setInterval(async () => {
    const pending = state.runs.filter(r => r.status === 'running' || r.status === 'needs_input');
    if (!pending.length) {
      clearInterval(pollRunsTimer);
      pollRunsTimer = 0;
      return;
    }
    await Promise.all(
      pending.map(async run => {
        try {
          const logs = await window.deck.agent.logs(run.sessionId);
          if (logs?.exists && logs.status) {
            await handleRunStateUpdate(run.sessionId, logs.status);
          }
        } catch {
          // ignore transient poll error
        }
      }),
    );
  }, 3000);
}

async function submitAiGeneration({ composeOnly = false } = {}) {
  const errEl = $('ai-err');
  errEl.textContent = '';

  if (!state.hasProject) {
    errEl.textContent = t('noProjectBanner');
    return;
  }

  const mode = getUiSelectValue($('ai-mode')) || 'create';
  const diagramType = getUiSelectValue($('ai-type')) || 'auto';
  const userPrompt = $('ai-prompt').value.trim();
  const includeCodebase = Boolean($('ai-include-codebase').checked);

  if (!userPrompt) {
    errEl.textContent = t('aiPromptLabel');
    $('ai-prompt').focus();
    return;
  }

  const defaultDir = getDefaultDir();
  const rawId = $('ai-id').value.trim();
  const targetPath = mode === 'revise'
    ? state.activePath
    : (rawId ? resolveDiagramPathFromId(rawId) : '');
  const autoTarget = mode === 'create' && !targetPath;

  if (mode === 'revise' && state.dirty) {
    await saveActiveFile({ silent: true });
  }

  const existingPaths = state.files.map(f => f.path).slice(0, 30);
  const beforeFiles = Object.fromEntries(state.files.map(f => [f.path, f.modifiedAt || 0]));
  const label = userPrompt.replace(/\s+/g, ' ').slice(0, 32);

  const prompt = buildAiPrompt({
    mode,
    diagramType,
    targetPath,
    defaultDir,
    existingPaths,
    userPrompt,
    includeCodebase,
  });

  try {
    if (composeOnly) {
      const items = [];
      if (mode === 'revise' && targetPath) {
        items.push({ kind: 'file', path: targetPath, title: displayTitleFromPath(targetPath) });
      }
      await window.deck.agent.compose({
        target: 'new',
        title: `Excalidraw: ${targetPath ? displayTitleFromPath(targetPath) : label}`,
        draft: `/excalidraw-diagram-generator\n\n${prompt}`,
        items,
        focus: true,
        closeDeck: false,
        ...agentRunOptions(),
      });
      $('modal-ai').hidden = true;
      return;
    }

    ensureAgentSubscriptions();
    const res = await window.deck.agent.run({
      prompt,
      skill: 'excalidraw-diagram-generator',
      actionId: mode === 'revise' ? 'revise-diagram' : 'generate-diagram',
      wait: false,
      dedupe: 'none',
      focus: false,
      ...agentRunOptions(),
    });

    const runRecord = {
      sessionId: res.sessionId,
      targetPath,
      autoTarget,
      defaultDir,
      beforeFiles,
      label,
      mode,
      diagramType,
      status: res.status || 'running',
      updatedAt: Date.now(),
    };
    state.runs = [runRecord, ...state.runs.filter(r => r.sessionId !== res.sessionId)].slice(0, 12);
    window.deck.store?.put?.('recentRuns', state.runs).catch(() => {});
    $('modal-ai').hidden = true;
    renderRail();
    syncRunPoller();
  } catch (err) {
    errEl.textContent = t('aiFailedMsg', { err: err.message || String(err) });
  }
}

/* Initialization */
function initStaticSelects() {
  initUiSelect($('new-template'), {
    options: [
      { value: 'blank', label: t('tplBlank') },
      { value: 'architecture', label: t('tplArchitecture') },
      { value: 'flowchart', label: t('tplFlowchart') },
      { value: 'sequence', label: t('tplSequence') },
      { value: 'mindmap', label: t('tplMindmap') },
      { value: 'er', label: t('tplEr') },
    ],
    value: 'architecture',
  });

  initUiSelect($('ai-mode'), {
    options: [
      { value: 'create', label: t('aiModeCreate') },
      { value: 'revise', label: t('aiModeRevise'), disabled: !state.activePath },
    ],
    value: 'create',
    onChange: val => {
      $('modal-ai-h').textContent = val === 'revise' ? t('aiModalReviseTitle') : t('aiModalCreateTitle');
      $('ai-id-wrap').hidden = val === 'revise';
      $('ai-prompt').setAttribute('placeholder', val === 'revise' ? t('aiPromptRevisePh') : t('aiPromptCreatePh'));
    },
  });

  initUiSelect($('ai-type'), {
    options: [
      { value: 'auto', label: t('typeAuto') },
      { value: 'architecture', label: t('typeArchitecture') },
      { value: 'flowchart', label: t('typeFlowchart') },
      { value: 'sequence', label: t('typeSequence') },
      { value: 'er', label: t('typeEr') },
      { value: 'mindmap', label: t('typeMindmap') },
      { value: 'relationship', label: t('typeRelationship') },
    ],
    value: 'auto',
  });

  setupAgentSelectHandlers('ex', () => {
    syncAgentPickers('ex');
    syncAgentPickers('ai');
    renderAgentPill();
  });

  setupAgentSelectHandlers('ai', () => {
    syncAgentPickers('ai');
    syncAgentPickers('ex');
    renderAgentPill();
  });
}

function wireEvents() {
  for (const tab of document.querySelectorAll('.main-tab')) {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  }

  $('btn-new-diagram').addEventListener('click', openNewModal);
  $('gallery-new-btn').addEventListener('click', openNewModal);
  $('empty-create-btn').addEventListener('click', openNewModal);

  $('btn-ai-generate').addEventListener('click', () => openAiModal('create'));
  $('gallery-ai-btn').addEventListener('click', () => openAiModal('create'));
  $('empty-ai-btn').addEventListener('click', () => openAiModal('create'));
  $('btn-ai-revise').addEventListener('click', () => openAiModal('revise'));

  $('btn-save').addEventListener('click', () => void saveActiveFile({ silent: false }));
  $('btn-import').addEventListener('click', () => void handleImportFiles());
  $('gallery-import-btn').addEventListener('click', () => void handleImportFiles());

  $('btn-export-menu').addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('export-menu');
    const next = menu.hidden;
    menu.hidden = !next;
    $('btn-export-menu').setAttribute('aria-expanded', String(next));
  });
  $('btn-export-json').addEventListener('click', () => void handleExport('json'));
  $('btn-export-png').addEventListener('click', () => void handleExport('png'));
  $('btn-export-svg').addEventListener('click', () => void handleExport('svg'));
  $('btn-open-card').addEventListener('click', () => {
    $('export-menu').hidden = true;
    if (state.activePath && !state.preview && state.hasProject) {
      window.deck.ui?.open?.({ path: state.activePath }).catch(err => toast(err.message, true));
    }
  });

  $('btn-deck-settings').addEventListener('click', () => {
    if (!state.preview) window.deck.ui?.openSettings?.().catch(() => {});
  });
  $('btn-refresh').addEventListener('click', async () => {
    if (state.preview) return;
    await scanWorkspaceDiagrams({ deep: true });
    if (state.activePath && state.files.some(f => f.path === state.activePath)) {
      await openFile(state.activePath, { forceReload: true });
    }
    renderRail();
    if (state.view === 'files') renderGallery();
  });

  $('btn-toggle-rail').addEventListener('click', () => {
    setNarrowDrawer(state.narrowDrawer === 'rail' ? '' : 'rail');
  });
  $('btn-close-rail').addEventListener('click', () => setNarrowDrawer(''));
  $('drawer-scrim').addEventListener('click', () => setNarrowDrawer(''));

  const syncFilter = val => {
    state.filterText = val;
    $('rail-search').value = val;
    $('gallery-search').value = val;
    renderRail();
    if (state.view === 'files') renderGallery();
  };
  $('rail-search').addEventListener('input', e => syncFilter(e.target.value));
  $('gallery-search').addEventListener('input', e => syncFilter(e.target.value));

  $('btn-copy-json').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('json-editor').value);
      toast(t('copiedJson'));
    } catch {
      $('json-editor').select();
      document.execCommand('copy');
      toast(t('copiedJson'));
    }
  });

  $('btn-apply-json').addEventListener('click', async () => {
    try {
      const parsed = await parseDiagramJson($('json-editor').value);
      $('empty-canvas').hidden = true;
      await mountOrUpdateCanvas(parsed);
      state.dirty = true;
      updateSaveBadge();
      toast(t('appliedJson'));
      switchView('canvas');
      if (state.params.autoSave && !state.preview && state.activePath && state.hasProject) {
        void saveActiveFile({ silent: true });
      }
    } catch (err) {
      toast(t('invalidJson', { err: err.message || String(err) }), true);
    }
  });

  /* Agent popover */
  $('agent-override-pill').addEventListener('click', e => {
    e.stopPropagation();
    const pop = $('agent-popover');
    const next = pop.hidden;
    pop.hidden = !next;
    state.agentMenuOpen = next;
    $('agent-override-pill').setAttribute('aria-expanded', String(next));
    if (next) syncAgentPickers('ex');
  });
  $('ex-agent-reset').addEventListener('click', async () => {
    state.selectedAgent = { provider: '', model: '', effort: '' };
    if (!state.preview && window.deck?.agent?.resetDefaults) {
      try {
        state.agentCatalog = await window.deck.agent.resetDefaults();
      } catch {
        // ignore
      }
    }
    syncAgentPickers('ex');
    syncAgentPickers('ai');
    renderAgentPill();
  });
  $('ex-agent-save-default').addEventListener('click', async () => {
    if (state.preview || !window.deck?.agent?.setDefaults) return;
    const eff = getEffectiveAgent();
    try {
      state.agentCatalog = await window.deck.agent.setDefaults({
        provider: eff.provider,
        model: eff.model,
        effort: eff.effort || null,
      });
      state.selectedAgent = {
        provider: state.agentCatalog?.defaults?.deck?.provider || '',
        model: state.agentCatalog?.defaults?.deck?.model || '',
        effort: state.agentCatalog?.defaults?.deck?.effort || '',
      };
      renderAgentPill();
      $('agent-popover').hidden = true;
    } catch (err) {
      toast(err.message || String(err), true);
    }
  });

  /* Modals */
  $('new-cancel').addEventListener('click', () => { $('modal-new').hidden = true; });
  $('new-create').addEventListener('click', () => void handleCreateNewDiagram());
  $('new-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') void handleCreateNewDiagram();
  });

  $('ai-cancel').addEventListener('click', () => { $('modal-ai').hidden = true; });
  $('ai-compose').addEventListener('click', () => void submitAiGeneration({ composeOnly: true }));
  $('ai-run').addEventListener('click', () => void submitAiGeneration({ composeOnly: false }));

  $('preview-close-x').addEventListener('click', closePreviewModal);
  $('preview-edit-btn').addEventListener('click', () => {
    const p = state.previewModalPath;
    closePreviewModal();
    if (p) void openFile(p, { switchToCanvas: true });
  });
  $('preview-open-card').addEventListener('click', () => {
    if (state.previewModalPath && !state.preview && state.hasProject) {
      window.deck.ui?.open?.({ path: state.previewModalPath }).catch(() => {});
    }
  });

  $('rename-cancel').addEventListener('click', () => { $('modal-rename').hidden = true; });
  $('rename-confirm').addEventListener('click', () => void handleConfirmRename());
  $('rename-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') void handleConfirmRename();
  });

  $('confirm-cancel').addEventListener('click', () => { $('modal-confirm').hidden = true; });
  $('confirm-ok').addEventListener('click', () => void handleConfirmDelete());

  /* Dismiss dropdowns & modals on outside click / Escape */
  document.addEventListener('pointerdown', e => {
    const agentWrap = $('agent-override-wrap');
    if (state.agentMenuOpen && !agentWrap.contains(e.target) && !isSelectMenuOwnedBy(e.target, agentWrap)) {
      $('agent-popover').hidden = true;
      state.agentMenuOpen = false;
      $('agent-override-pill').setAttribute('aria-expanded', 'false');
    }
    const expWrap = $('export-wrap');
    if (!$('export-menu').hidden && !expWrap.contains(e.target)) {
      $('export-menu').hidden = true;
      $('btn-export-menu').setAttribute('aria-expanded', 'false');
    }
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveActiveFile({ silent: false });
      return;
    }
    if (e.key === 'Escape') {
      for (const id of ['modal-preview', 'modal-new', 'modal-ai', 'modal-rename', 'modal-confirm']) {
        if (!$(id).hidden) $(id).hidden = true;
      }
      if (!$('agent-popover').hidden) {
        $('agent-popover').hidden = true;
        state.agentMenuOpen = false;
      }
      if (!$('export-menu').hidden) $('export-menu').hidden = true;
    }
  });
}

async function boot() {
  state.locale = normalizeLocale(navigator.language || getLocale());
  setLocale(state.locale);
  applyI18n();

  const ctx = await window.deck.context();
  state.preview = Boolean(ctx?.preview);
  state.hasProject = Boolean(ctx?.worktreePath);
  const nextLocale = normalizeLocale(ctx?.locale || getLocale());
  if (nextLocale !== state.locale) {
    state.locale = nextLocale;
    setLocale(state.locale);
    applyI18n();
  }
  applyTheme(ctx?.theme === 'dark' ? 'dark' : 'light');

  window.deck.ui?.onThemeChange?.(next => applyTheme(next));

  initStaticSelects();
  wireEvents();

  if (state.preview) {
    void getExcalidraw();
    $('banner').textContent = t('previewBanner');
    $('banner').hidden = false;
    state.agentCatalog = SAMPLE_AGENT_CATALOG;
    syncAgentPickers('ex');
    renderAgentPill();
    state.files = buildPreviewSamples(state.locale);
    renderRail();
    await openFile(state.files[0].path);
    $('app').dataset.state = 'ready';
    return;
  }

  if (!state.hasProject) {
    $('banner').textContent = t('noProjectBanner');
    $('banner').hidden = false;
  }

  const [pState, catalog, recent, savedActivePath, cachedFiles] = await Promise.all([
    window.deck.params?.get?.().catch(() => null),
    window.deck.agent?.catalog?.().catch(() => null),
    state.hasProject ? window.deck.store?.get?.('recentRuns').catch(() => null) : null,
    state.hasProject ? window.deck.store?.get?.('activePath').catch(() => '') : '',
    state.hasProject ? window.deck.store?.get?.('cachedFiles').catch(() => null) : null,
  ]);

  if (pState?.values) {
    state.params = { ...state.params, ...pState.values };
  }
  window.deck.params?.onChange?.(next => {
    if (next?.values) state.params = { ...state.params, ...next.values };
  });

  if (catalog) {
    state.agentCatalog = catalog;
    const deckDef = catalog?.defaults?.deck;
    if (deckDef) {
      state.selectedAgent = {
        provider: deckDef.provider || '',
        model: deckDef.model || '',
        effort: deckDef.effort || '',
      };
    }
    window.deck.agent?.onDefaults?.(evt => {
      if (state.agentCatalog && evt?.defaults) {
        state.agentCatalog.defaults = evt.defaults;
        renderAgentPill();
      }
    });
  } else {
    state.agentCatalog = SAMPLE_AGENT_CATALOG;
  }
  syncAgentPickers('ex');
  renderAgentPill();

  if (Array.isArray(recent)) state.runs = recent;
  if (Array.isArray(cachedFiles) && cachedFiles.length) {
    state.files = cachedFiles;
    sortFilesList();
  }
  const initialCandidate = savedActivePath || state.files[0]?.path || '';
  if (initialCandidate) {
    state.activePath = initialCandidate;
  }
  syncActiveFileHeader();
  renderRail();
  syncRunPoller();

  const quickScanPromise = state.hasProject
    ? scanWorkspaceDiagrams({ deep: false })
    : Promise.resolve();

  if (initialCandidate) {
    const opened = await openFile(initialCandidate, { quietOnMissing: true });
    await quickScanPromise;
    if (!opened) {
      const fallback = state.files[0]?.path || '';
      if (fallback && fallback !== initialCandidate) {
        await openFile(fallback);
      } else {
        state.activePath = '';
        syncActiveFileHeader();
        $('empty-canvas').hidden = !state.hasProject;
        $('btn-ai-revise').disabled = true;
      }
    }
  } else {
    if (state.hasProject) {
      $('empty-canvas').hidden = false;
      $('btn-ai-revise').disabled = true;
    }
    await quickScanPromise;
    const first = state.files[0]?.path || '';
    if (first) {
      await openFile(first);
    } else if (!state.hasProject) {
      void mountOrUpdateCanvas(buildTemplateScene('blank', state.locale));
    }
  }

  renderRail();
  $('app').dataset.state = 'ready';
}

boot().catch(err => {
  console.error('Excalidraw Deck boot failed:', err);
  toast(err?.message || String(err), true);
});
