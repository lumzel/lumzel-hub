import {
  lessonId,
  normText,
  parseLessonsMd,
  composeConstraints,
  formatLessonsMd,
} from './lib/constraints.js';

const LESSONS_FILE = '.lumzel/hanakoxbt-loops-and-graphs/lessons.md';
const SCOPES = ['split', 'check', 'impl', 'review', 'general'];

export function createLessonsController(store, safe) {
  let writeTimer = null;

  function computeFileOnly(list, fileEntries) {
    const storeIds = new Set((list || []).map(l => l.id || lessonId(l.text)));
    const storeNorms = new Set((list || []).map(l => normText(l.text)));
    const out = [];
    for (const fl of fileEntries || []) {
      const id = lessonId(fl.text);
      if (storeIds.has(id) || storeNorms.has(normText(fl.text))) continue;
      out.push({
        id,
        text: fl.text,
        scope: SCOPES.includes(fl.scope) ? fl.scope : 'general',
      });
    }
    return out;
  }

  function scheduleFileSync() {
    if (store.get().mode === 'demo') return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      syncToFileNow();
    }, 800);
  }

  async function syncToFileNow() {
    const st = store.get();
    if (st.caps.files === false || !window.deck?.files?.write) {
      store.set(s => ({ ...s, fileSyncStatus: 'off' }));
      return;
    }
    const md = formatLessonsMd(st.lessons.list);
    const r = await safe(() => window.deck.files.write(LESSONS_FILE, md), 'files');
    store.set(s => ({
      ...s,
      fileSyncStatus: r.ok ? 'synced' : 'off',
    }));
  }

  async function persistItem(item) {
    if (store.get().mode === 'demo') return;
    if (store.get().caps.db === false || !window.deck?.store?.put) return;
    await safe(() => window.deck.store.put('lessons', item.id, item), 'db');
  }

  async function deleteStoredItem(id) {
    if (store.get().mode === 'demo') return;
    if (store.get().caps.db === false || !window.deck?.store?.delete) return;
    await safe(() => window.deck.store.delete('lessons', id), 'db');
  }

  function setList(updater, syncFile = true) {
    store.set(s => {
      const nextList = updater(s.lessons.list);
      return {
        ...s,
        lessons: { rev: s.lessons.rev + 1, list: nextList },
        fileLessons: computeFileOnly(nextList, s.parsedFileEntries || []),
      };
    });
    if (syncFile) scheduleFileSync();
  }

  async function load(listRes, fileRes) {
    const items = [];
    if (listRes && listRes.ok && Array.isArray(listRes.v)) {
      for (const entry of listRes.v) {
        const val = entry && entry.value ? entry.value : entry;
        if (!val || !val.text) continue;
        items.push({
          id: val.id || lessonId(val.text),
          text: String(val.text).trim().slice(0, 280),
          scope: SCOPES.includes(val.scope) ? val.scope : 'general',
          status: ['active', 'proposed', 'muted'].includes(val.status) ? val.status : 'active',
          evidence: String(val.evidence || ''),
          source: val.source || null,
          hits: Number(val.hits) || 0,
          createdAt: Number(val.createdAt) || Math.floor(Date.now() / 1000),
          updatedAt: Number(val.updatedAt) || Math.floor(Date.now() / 1000),
        });
      }
    }
    const rawFile =
      fileRes && fileRes.ok
        ? typeof fileRes.v === 'string'
          ? fileRes.v
          : fileRes.v && typeof fileRes.v.content === 'string'
            ? fileRes.v.content
            : ''
        : '';
    const parsedFileEntries = rawFile ? parseLessonsMd(rawFile) : [];
    const fileOnly = computeFileOnly(items, parsedFileEntries);
    store.set(s => ({
      ...s,
      lessons: { rev: s.lessons.rev + 1, list: items },
      parsedFileEntries,
      fileLessons: fileOnly,
      fileSyncStatus: fileRes && fileRes.ok ? 'synced' : s.caps.files === false ? 'off' : 'idle',
    }));
  }

  async function add(rawText, scope = 'general', status = 'active', meta = {}) {
    const text = String(rawText || '').trim().slice(0, 280);
    if (!text) return null;
    const id = lessonId(text);
    const now = Math.floor(Date.now() / 1000);
    const existing = store.get().lessons.list.find(l => l.id === id);
    if (existing) {
      if (status === 'active' && existing.status !== 'active') {
        await setStatus(id, 'active');
      }
      return existing;
    }
    const item = {
      id,
      text,
      scope: SCOPES.includes(scope) ? scope : 'general',
      status,
      evidence: String(meta.evidence || '').slice(0, 400),
      source: meta.source || null,
      hits: Number(meta.hits) || 0,
      createdAt: now,
      updatedAt: now,
    };
    setList(list => [item, ...list], status === 'active');
    await persistItem(item);
    return item;
  }

  async function setStatus(id, status) {
    const now = Math.floor(Date.now() / 1000);
    let updated = null;
    setList(
      list =>
        list.map(l => {
          if (l.id !== id) return l;
          updated = { ...l, status, updatedAt: now };
          return updated;
        }),
      true,
    );
    if (updated) await persistItem(updated);
  }

  async function update(id, patch) {
    const now = Math.floor(Date.now() / 1000);
    let updated = null;
    const oldItem = store.get().lessons.list.find(l => l.id === id);
    if (!oldItem) return;
    const nextText = patch.text !== undefined ? String(patch.text).trim().slice(0, 280) : oldItem.text;
    if (!nextText) return;
    const nextScope = patch.scope && SCOPES.includes(patch.scope) ? patch.scope : oldItem.scope;
    const nextId = lessonId(nextText);
    updated = { ...oldItem, id: nextId, text: nextText, scope: nextScope, updatedAt: now };

    setList(list => {
      const filtered = list.filter(l => l.id !== id && (nextId === id || l.id !== nextId));
      return [updated, ...filtered];
    }, true);

    if (nextId !== id) await deleteStoredItem(id);
    await persistItem(updated);
  }

  async function remove(id) {
    const prev = store.get().lessons.list.find(l => l.id === id);
    setList(list => list.filter(l => l.id !== id), prev?.status === 'active');
    await deleteStoredItem(id);
  }

  async function importFromFile(entry) {
    return add(entry.text, entry.scope, 'active');
  }

  async function ingestRunResults(run) {
    if (!run || store.get().mode === 'demo') return;
    const outputs = run.outputs || {};
    const proposed =
      (outputs.record && outputs.record.lessons) ||
      (outputs.learn && outputs.learn.lessons) ||
      [];

    for (const pl of proposed) {
      if (!pl || !pl.text) continue;
      const id = lessonId(pl.text);
      const exists = store.get().lessons.list.some(l => l.id === id);
      if (exists) continue;
      await add(pl.text, pl.scope || 'general', 'proposed', {
        evidence: pl.evidence || '',
        source: { runId: run.runId, workflowId: run.workflowId },
      });
    }

    if (run.state === 'completed') {
      const injectedIds = new Set(
        (outputs.preflight && outputs.preflight.constraintIds) ||
          [],
      );
      if (injectedIds.size > 0) {
        const now = Math.floor(Date.now() / 1000);
        const touched = [];
        setList(
          list =>
            list.map(l => {
              if (l.status === 'active' && injectedIds.has(l.id)) {
                const next = { ...l, hits: (l.hits || 0) + 1, updatedAt: now };
                touched.push(next);
                return next;
              }
              return l;
            }),
          false,
        );
        for (const item of touched) {
          await persistItem(item);
        }
      }
    }
  }

  function getActiveForPreset(preset) {
    const active = store.get().lessons.list.filter(l => l.status === 'active');
    if (preset === 'code-review') {
      return active.filter(l => l.scope === 'review' || l.scope === 'general');
    }
    return active;
  }

  function getComposedPreview(preset) {
    const active = getActiveForPreset(preset);
    const fileOnly = store.get().fileLessons || [];
    const mergedTexts = [...active.map(l => l.text), ...fileOnly.map(f => f.text)];
    return composeConstraints(mergedTexts);
  }

  return {
    LESSONS_FILE,
    SCOPES,
    load,
    add,
    setStatus,
    update,
    remove,
    importFromFile,
    ingestRunResults,
    getActiveForPreset,
    getComposedPreview,
    syncToFileNow,
  };
}
