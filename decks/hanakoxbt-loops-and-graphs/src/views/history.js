import { h, clear } from '../lib/dom.js';
import { fmtDuration, fmtRelative } from '../lib/format.js';
import { t } from '../i18n.js';

const ROW_H = 52;
const WINDOW_THRESHOLD = 100;

export function createHistoryRenderer(store, host) {
  let scrollTop = 0;

  return function renderHistory(container) {
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

    if (list.length <= WINDOW_THRESHOLD) {
      const wrap = h('div', { class: 'hist-list' });
      for (const item of list) wrap.appendChild(makeRow(item));
      container.appendChild(wrap);
      return;
    }

    // Windowed rendering for > 100 history rows (§8.6)
    const viewport = h('div', {
      style: {
        position: 'relative',
        height: '100%',
        overflowY: 'auto',
      },
      onScroll: e => {
        scrollTop = e.target.scrollTop;
        drawSlice();
      },
    });
    const spacer = h('div', { style: { height: `${list.length * ROW_H}px`, position: 'relative' } });
    const slice = h('div', { style: { position: 'absolute', left: 0, right: 0, top: 0 } });
    spacer.appendChild(slice);
    viewport.appendChild(spacer);
    container.appendChild(viewport);
    viewport.scrollTop = scrollTop;

    function drawSlice() {
      const viewH = container.clientHeight || 480;
      const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 3);
      const count = Math.ceil(viewH / ROW_H) + 6;
      const end = Math.min(list.length, start + count);
      slice.style.top = `${start * ROW_H}px`;
      clear(slice);
      for (let i = start; i < end; i++) {
        slice.appendChild(makeRow(list[i]));
      }
    }
    drawSlice();
  };
}
