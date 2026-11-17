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
