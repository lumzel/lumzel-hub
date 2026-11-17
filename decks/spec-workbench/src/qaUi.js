// In-place Q&A interaction and scroll preservation helpers for spec-workbench.

export function syncQaOptionButtons(wrap, value) {
  if (!wrap) return;
  for (const optBtn of wrap.querySelectorAll('.qa-opt')) {
    optBtn.classList.toggle('on', optBtn.dataset.optValue === value);
  }
}

export function applyQaAnswerSelection({ answers, answerKey, value, itemEl, inputEl = null }) {
  if (answers && answerKey) {
    answers[answerKey] = value;
  }
  if (inputEl && inputEl.value !== value) {
    inputEl.value = value;
  }
  syncQaOptionButtons(itemEl, value);
}

export function captureContainerScrollTop(container, featureId, scrollTarget = container) {
  if (!container || container.dataset?.featureId !== featureId) return 0;
  return Number(scrollTarget?.scrollTop) || 0;
}

export function restoreContainerScrollTop(container, featureId, scrollTop, scrollTarget = container) {
  if (!container) return;
  if (container.dataset) container.dataset.featureId = featureId || '';
  if (scrollTarget) {
    scrollTarget.scrollTop = scrollTop > 0 ? scrollTop : 0;
  }
}

export function draftStoreKey(kind, featureId) {
  return `${kind === 'tickets' ? 'tickets' : 'design'}:${String(featureId || '').trim()}`;
}

export function normalizeQaDraft(raw) {
  const answers = {};
  if (raw && raw.answers && typeof raw.answers === 'object') {
    for (const [key, val] of Object.entries(raw.answers)) {
      if (typeof key !== 'string' || !key) continue;
      const str = val == null ? '' : String(val);
      if (str) answers[key] = str;
    }
  }
  const note = typeof raw?.note === 'string' ? raw.note : raw?.note == null ? '' : String(raw.note);
  const updatedAt = Number(raw?.updatedAt) || 0;
  return { answers, note, updatedAt };
}

export function hasQaDraftContent(draft) {
  if (!draft || typeof draft !== 'object') return false;
  if (typeof draft.note === 'string' && draft.note.trim().length > 0) return true;
  if (draft.answers && typeof draft.answers === 'object') {
    return Object.values(draft.answers).some(val => String(val || '').trim().length > 0);
  }
  return false;
}

export function shouldAutoOpenQaPanel({ hasOpen = false, draft = null, explicitCollapsed } = {}) {
  if (typeof explicitCollapsed === 'boolean') return !explicitCollapsed;
  return Boolean(hasOpen || hasQaDraftContent(draft));
}

export function mergeStoredQaDrafts({
  memoryDrafts = {},
  entries = [],
  kind = 'design',
  dirtyKeys = null,
  clearedAtMap = {},
} = {}) {
  const targetKind = kind === 'tickets' ? 'tickets' : 'design';
  const next = { ...memoryDrafts };

  for (const entry of entries || []) {
    const rawKey = typeof entry?.key === 'string' ? entry.key : '';
    const value = entry?.value && typeof entry.value === 'object' ? entry.value : null;
    if (!value) continue;

    let entryKind = value.kind === 'tickets' || value.kind === 'design' ? value.kind : '';
    let featureId = typeof value.featureId === 'string' ? value.featureId.trim() : '';
    if ((!entryKind || !featureId) && rawKey.includes(':')) {
      const sep = rawKey.indexOf(':');
      const prefix = rawKey.slice(0, sep);
      const rest = rawKey.slice(sep + 1).trim();
      if ((prefix === 'design' || prefix === 'tickets') && rest) {
        if (!entryKind) entryKind = prefix;
        if (!featureId) featureId = rest;
      }
    }
    if (entryKind !== targetKind || !featureId) continue;

    const storeKey = draftStoreKey(targetKind, featureId);
    if (dirtyKeys && typeof dirtyKeys.has === 'function' && dirtyKeys.has(storeKey)) continue;

    const normalized = normalizeQaDraft(value);
    if (!hasQaDraftContent(normalized)) continue;

    const clearedAt = Number(clearedAtMap?.[storeKey]) || 0;
    if (clearedAt > 0 && normalized.updatedAt <= clearedAt) continue;

    const existing = next[featureId];
    if (existing && (Number(existing.updatedAt) || 0) > normalized.updatedAt && hasQaDraftContent(existing)) {
      continue;
    }
    next[featureId] = normalized;
  }

  return next;
}

