import { h, clear } from '../lib/dom.js';
import { fmtDuration, fmtRelative } from '../lib/format.js';
import { t } from '../i18n.js';

const PAGE_SIZE = 25;

export function createHistoryRenderer(store, host) {
  let cleanup = null;

  function teardown() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  }

  return function renderHistory(container) {
    teardown();
    clear(container);
    const st = store.get();
    const list = st.history || [];

    if (st.caps.db === false) {
      container.appendChild(
        h('div', { class: 'note-box', style: { marginBottom: '12px', borderColor: 'var(--gate)' } }, t('noDbPerm')),
      );
    }

    if (!list.length) {
      container.appendChild(h('div', { class: 'empty-state' }, t('historyEmpty')));
      return;
    }

    const activeId = st.run && st.run.runId;
    const nowSec = st.ui.tick || Math.floor(Date.now() / 1000);

    function makeRow(item) {
      const dotCls =
        item.state === 'completed'
          ? 'ok'
          : item.state === 'waiting_gate'
            ? 'gate'
            : item.state === 'failed' || item.state === 'limit'
              ? 'fail'
              : item.state === 'running'
                ? 'worker'
                : '';

      const dur =
        item.startedAt && item.finishedAt
          ? fmtDuration(item.finishedAt - item.startedAt)
          : item.startedAt && (item.state === 'running' || item.state === 'waiting_gate')
            ? fmtDuration(nowSec - item.startedAt)
            : '—';

      let summaryTxt = item.state;
      const sum = item.summary || {};
      if (item.expired) {
        summaryTxt = t('expired');
      } else if (item.workflowId === 'code-review' && sum.verdict) {
        const c = sum.counts || { high: 0, medium: 0, low: 0 };
        summaryTxt = `${sum.verdict} · H${c.high} M${c.medium} L${c.low}`;
      } else if (sum.units) {
        summaryTxt = `${sum.passed || 0}/${sum.units} ✓${sum.shipped ? ' · shipped' : ''}`;
      }

      return h(
        'div',
        {
          class: 'hist-row',
          'data-active': activeId === item.runId ? 'true' : 'false',
          onClick: () => host.inspectRun(item.runId),
        },
        h(
          'div',
          { class: 'hist-top' },
          h('i', { class: `dot ${dotCls}` }),
          h('span', { class: 'chip', style: { height: '18px', fontSize: '10px' } }, item.workflowId),
          h('span', { class: 'hist-goal' }, item.goal || item.runId.slice(0, 8)),
        ),
        h(
          'div',
          { class: 'hist-bot' },
          h('span', null, `${fmtRelative(item.startedAt, st.ctx.locale, nowSec)} · ${dur}`),
          h('span', { style: { color: item.expired ? 'var(--fail)' : 'var(--muted)' } }, summaryTxt),
        ),
      );
    }

    const wrap = h('div', { class: 'hist-list' });
    container.appendChild(wrap);

    let rendered = 0;
    let sentinel = null;
    let observer = null;
    let scrollRaf = 0;

    function detachListeners() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (scrollRaf) {
        cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
      }
      container.removeEventListener('scroll', onScroll);
    }

    function appendNextBatch() {
      if (rendered >= list.length) {
        if (sentinel && sentinel.parentNode) sentinel.remove();
        detachListeners();
        return;
      }
      const nextEnd = Math.min(list.length, rendered + PAGE_SIZE);
      const frag = document.createDocumentFragment();
      for (let i = rendered; i < nextEnd; i++) {
        frag.appendChild(makeRow(list[i]));
      }
      if (sentinel && sentinel.parentNode === wrap) {
        wrap.insertBefore(frag, sentinel);
      } else {
        wrap.appendChild(frag);
      }
      rendered = nextEnd;

      const remaining = list.length - rendered;
      if (remaining <= 0) {
        if (sentinel && sentinel.parentNode) sentinel.remove();
        detachListeners();
      } else if (sentinel) {
        const btn = sentinel.querySelector('button');
        if (btn) btn.textContent = t('loadMore', { n: remaining });
      }
    }

    function onScroll() {
      if (scrollRaf || rendered >= list.length) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (rendered >= list.length) return;
        const distToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
        if (distToBottom < 180) {
          appendNextBatch();
        }
      });
    }

    appendNextBatch();

    if (rendered < list.length) {
      const moreBtn = h(
        'button',
        { type: 'button', class: 'ghost', onClick: appendNextBatch },
        t('loadMore', { n: list.length - rendered }),
      );
      sentinel = h('div', { class: 'lazy-sentinel' }, moreBtn);
      wrap.appendChild(sentinel);

      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          entries => {
            if (entries.some(e => e.isIntersecting)) {
              appendNextBatch();
            }
          },
          { root: container, rootMargin: '160px' },
        );
        observer.observe(sentinel);
      }
      container.addEventListener('scroll', onScroll, { passive: true });
      cleanup = detachListeners;
    }
  };
}
