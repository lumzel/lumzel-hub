import { h, clear, setAttr, setText } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { derive } from '../runModel.js';
import { getTopology } from '../topology/index.js';
import { normalizeEpochSec } from '../telemetry.js';
import { t } from '../i18n.js';

const ROW_BATCH = 25;

export function mountTimeline(store, host) {
  const appEl = document.getElementById('app');
  const tlEl = document.getElementById('tl');

  let prevStructuralKey = null;
  let elapsedEl = null;
  let axisTickEls = [];
  let liveSegEntries = [];
  let baseSec = 0;
  let rowObserver = null;

  function disconnectRowObserver() {
    if (rowObserver) {
      rowObserver.disconnect();
      rowObserver = null;
    }
  }

  function toggleTimeline() {
    host.savePrefs({ timelineOpen: !store.get().ui.timelineOpen });
  }

  function patchTickInPlace(open, view, nowSec) {
    if (elapsedEl) {
      setText(elapsedEl, view.elapsedSec !== null ? fmtDuration(view.elapsedSec) : '—');
    }
    if (!open) return;

    const totalSpan = Math.max(10, view.elapsedSec || 10);
    for (let i = 0; i < axisTickEls.length; i++) {
      setText(axisTickEls[i], fmtDuration(Math.round((totalSpan * i) / 4)));
    }
    for (const entry of liveSegEntries) {
      const leftPct = Math.max(0, Math.min(98, ((entry.start - baseSec) / totalSpan) * 100));
      const rightEnd = entry.end !== null ? entry.end : nowSec;
      const widthPct = Math.max(1.5, Math.min(100 - leftPct, ((rightEnd - entry.start) / totalSpan) * 100));
      entry.segEl.style.left = `${leftPct.toFixed(2)}%`;
      entry.segEl.style.width = `${widthPct.toFixed(2)}%`;
      entry.segEl.title = `${entry.label} · ${fmtDuration(rightEnd - entry.start)}`;
      if (entry.cursorEl) {
        entry.cursorEl.style.left = `${Math.min(99.5, leftPct + widthPct).toFixed(2)}%`;
      }
    }
  }

  store.subscribe(
    s => ({
      open: s.ui.timelineOpen,
      run: s.run,
      preset: s.preset,
      telemetryRev: s.telemetry.rev,
      tick: s.ui.tick,
      locale: s.ctx.locale,
    }),
    ({ open, run, preset, telemetryRev, locale }) => {
      const nowSec = store.get().ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(run, preset, telemetryRev, store.get().telemetry.byUnit, nowSec);
      const structuralKey = { open, run, preset, telemetryRev, locale };

      const isTickOnly =
        prevStructuralKey !== null &&
        prevStructuralKey.open === structuralKey.open &&
        prevStructuralKey.run === structuralKey.run &&
        prevStructuralKey.preset === structuralKey.preset &&
        prevStructuralKey.telemetryRev === structuralKey.telemetryRev &&
        prevStructuralKey.locale === structuralKey.locale;

      if (isTickOnly) {
        patchTickInPlace(open, view, nowSec);
        return;
      }

      prevStructuralKey = structuralKey;
      disconnectRowObserver();
      axisTickEls = [];
      liveSegEntries = [];

      setAttr(appEl, 'data-tl', open ? 'open' : 'closed');
      clear(tlEl);

      const topo = getTopology(view.preset);
      const orderIds = Object.keys(topo.META);

      // Collapsed/Header bar (28px)
      const mini = h('div', { class: 'tl-mini' });
      for (const id of orderIds) {
        const nv = view.nodes[id];
        mini.appendChild(
          h('span', {
            class: 'tl-mini-seg',
            'data-status': nv ? nv.status : 'queued',
            title: `${id}: ${nv ? nv.status : 'queued'}`,
          }),
        );
      }

      elapsedEl = h(
        'span',
        { class: 'mono', style: { fontSize: '10.5px', color: 'var(--muted)' } },
        view.elapsedSec !== null ? fmtDuration(view.elapsedSec) : '—',
      );

      const bar = h(
        'div',
        { class: 'tl-bar', onClick: toggleTimeline },
        h(
          'button',
          {
            type: 'button',
            class: 'ghost tl-toggle',
            'aria-expanded': open ? 'true' : 'false',
          },
          `${open ? '▾' : '▸'} ${t('timeline')}`,
        ),
        mini,
        elapsedEl,
      );
      tlEl.appendChild(bar);

      if (!open) return;

      const body = h('div', { class: 'tl-body' });
      baseSec = view.startedAt || nowSec;
      const totalSpan = Math.max(10, view.elapsedSec || 10);

      // Axis ticks
      const ticksWrap = h('div', { class: 'tl-ticks' });
      for (let i = 0; i <= 4; i++) {
        const tickEl = h('span', null, fmtDuration(Math.round((totalSpan * i) / 4)));
        axisTickEls.push(tickEl);
        ticksWrap.appendChild(tickEl);
      }
      body.appendChild(h('div', { class: 'tl-axis' }, h('span', null, 'NODE'), ticksWrap));

      if (!run || !(run.nodes && run.nodes.length)) {
        body.appendChild(
          h('div', { style: { color: 'var(--faint)', fontSize: '11px', paddingTop: '8px' } }, '—'),
        );
        tlEl.appendChild(body);
        return;
      }

      // Group raw run.nodes records by nodeId
      const recsById = new Map();
      for (const rec of run.nodes || []) {
        if (!recsById.has(rec.nodeId)) recsById.set(rec.nodeId, []);
        recsById.get(rec.nodeId).push(rec);
      }

      const rowSpecs = [];
      for (const id of orderIds) {
        const recs = recsById.get(id);
        if (!recs || !recs.length) continue;
        const meta = topo.META[id] || { role: 'code' };
        const segments = recs
          .map(r => {
            const sAt = normalizeEpochSec(r.startedAt);
            if (sAt === null) return null;
            const fAt = normalizeEpochSec(r.finishedAt);
            const running = r.state === 'running' && (view.state === 'running' || view.state === 'waiting_gate');
            return {
              start: sAt,
              end: fAt,
              status: r.state === 'failed' ? 'fail' : 'ok',
              running,
            };
          })
          .filter(Boolean);

        if (!segments.length) continue;
        rowSpecs.push({
          label: id,
          role: meta.role,
          segments,
          onSelect: () => {
            store.set(s => ({
              ...s,
              selection: { kind: 'node', id },
              ui: { ...s.ui, inspectorOpen: true, tab: 'node' },
            }));
          },
        });

        // Expand map unit sub-rows if lane telemetry timestamps exist
        if (meta.shape === 'map') {
          for (const lane of view.lanes || []) {
            if (lane.blueprint || !lane.startedAt) continue;
            rowSpecs.push({
              label: `  └ ${lane.id}`,
              role: 'worker',
              segments: [
                {
                  start: lane.startedAt,
                  end: lane.finishedAt,
                  status: lane.status === 'fail' ? 'fail' : 'ok',
                  running: lane.status === 'running' && view.state === 'running',
                },
              ],
              onSelect: () => {
                store.set(s => ({
                  ...s,
                  selection: { kind: 'lane', id: lane.id },
                  ui: { ...s.ui, inspectorOpen: true, tab: 'node' },
                }));
              },
            });
          }
        }
      }

      function buildRowElement(spec) {
        const curNow = store.get().ui.tick || Math.floor(Date.now() / 1000);
        const curSpan = Math.max(10, (view.startedAt ? curNow - view.startedAt : view.elapsedSec) || totalSpan);
        const track = h('div', { class: 'tl-track' });
        for (const seg of spec.segments) {
          const leftPct = Math.max(0, Math.min(98, ((seg.start - baseSec) / curSpan) * 100));
          const rightEnd = seg.end !== null ? seg.end : curNow;
          const widthPct = Math.max(1.5, Math.min(100 - leftPct, ((rightEnd - seg.start) / curSpan) * 100));
          const segEl = h('div', {
            class: 'tl-seg',
            'data-role': spec.role,
            'data-status': seg.status,
            style: { left: `${leftPct.toFixed(2)}%`, width: `${widthPct.toFixed(2)}%` },
            title: `${spec.label} · ${fmtDuration(rightEnd - seg.start)}`,
          });
          track.appendChild(segEl);
          let cursorEl = null;
          if (seg.running) {
            cursorEl = h('div', {
              class: 'tl-cursor',
              style: { left: `${Math.min(99.5, leftPct + widthPct).toFixed(2)}%` },
            });
            track.appendChild(cursorEl);
          }
          liveSegEntries.push({
            start: seg.start,
            end: seg.end,
            running: seg.running,
            label: spec.label,
            segEl,
            cursorEl,
          });
        }
        return h(
          'div',
          { class: 'tl-row', onClick: spec.onSelect },
          h('span', { class: 'tl-name', title: spec.label }, spec.label),
          track,
        );
      }

      let renderedRows = 0;
      let sentinel = null;

      function appendRowBatch() {
        const nextEnd = Math.min(rowSpecs.length, renderedRows + ROW_BATCH);
        const frag = document.createDocumentFragment();
        for (let i = renderedRows; i < nextEnd; i++) {
          frag.appendChild(buildRowElement(rowSpecs[i]));
        }
        if (sentinel && sentinel.parentNode === body) {
          body.insertBefore(frag, sentinel);
        } else {
          body.appendChild(frag);
        }
        renderedRows = nextEnd;
        const remaining = rowSpecs.length - renderedRows;
        if (remaining <= 0) {
          if (sentinel && sentinel.parentNode) sentinel.remove();
          disconnectRowObserver();
        } else if (sentinel) {
          const btn = sentinel.querySelector('button');
          if (btn) btn.textContent = t('loadMore', { n: remaining });
        }
      }

      appendRowBatch();
      tlEl.appendChild(body);

      if (renderedRows < rowSpecs.length) {
        const moreBtn = h(
          'button',
          { type: 'button', class: 'ghost', onClick: appendRowBatch },
          t('loadMore', { n: rowSpecs.length - renderedRows }),
        );
        sentinel = h('div', { class: 'lazy-sentinel' }, moreBtn);
        body.appendChild(sentinel);
        if (typeof IntersectionObserver !== 'undefined') {
          rowObserver = new IntersectionObserver(
            entries => {
              if (entries.some(e => e.isIntersecting)) {
                appendRowBatch();
              }
            },
            { root: body, rootMargin: '120px' },
          );
          rowObserver.observe(sentinel);
        }
      }
    },
    (a, b) =>
      a.open === b.open &&
      a.run === b.run &&
      a.preset === b.preset &&
      a.telemetryRev === b.telemetryRev &&
      a.tick === b.tick &&
      a.locale === b.locale,
  );
}
