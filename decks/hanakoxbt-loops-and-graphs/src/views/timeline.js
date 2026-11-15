import { h, clear, setAttr } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { derive } from '../runModel.js';
import { getTopology } from '../topology/index.js';
import { normalizeEpochSec } from '../telemetry.js';
import { t } from '../i18n.js';

export function mountTimeline(store, host) {
  const appEl = document.getElementById('app');
  const tlEl = document.getElementById('tl');

  function toggleTimeline() {
    host.savePrefs({ timelineOpen: !store.get().ui.timelineOpen });
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
    ({ open, run, preset, telemetryRev }) => {
      setAttr(appEl, 'data-tl', open ? 'open' : 'closed');
      clear(tlEl);

      const nowSec = store.get().ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(run, preset, telemetryRev, store.get().telemetry.byUnit, nowSec);
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
        h(
          'span',
          { class: 'mono', style: { fontSize: '10.5px', color: 'var(--muted)' } },
          view.elapsedSec !== null ? fmtDuration(view.elapsedSec) : '—',
        ),
      );
      tlEl.appendChild(bar);

      if (!open) return;

      const body = h('div', { class: 'tl-body' });
      const baseSec = view.startedAt || nowSec;
      const totalSpan = Math.max(10, view.elapsedSec || 10);

      // Axis ticks
      const ticksWrap = h('div', { class: 'tl-ticks' });
      for (let i = 0; i <= 4; i++) {
        ticksWrap.appendChild(h('span', null, fmtDuration(Math.round((totalSpan * i) / 4))));
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

      const renderRow = (label, role, segments, onSelect) => {
        const track = h('div', { class: 'tl-track' });
        for (const seg of segments) {
          const leftPct = Math.max(0, Math.min(98, ((seg.start - baseSec) / totalSpan) * 100));
          const rightEnd = seg.end !== null ? seg.end : nowSec;
          const widthPct = Math.max(1.5, Math.min(100 - leftPct, ((rightEnd - seg.start) / totalSpan) * 100));
          const segEl = h('div', {
            class: 'tl-seg',
            'data-role': role,
            'data-status': seg.status,
            style: { left: `${leftPct.toFixed(2)}%`, width: `${widthPct.toFixed(2)}%` },
            title: `${label} · ${fmtDuration(rightEnd - seg.start)}`,
          });
          track.appendChild(segEl);
          if (seg.running) {
            track.appendChild(
              h('div', {
                class: 'tl-cursor',
                style: { left: `${Math.min(99.5, leftPct + widthPct).toFixed(2)}%` },
              }),
            );
          }
        }
        body.appendChild(
          h(
            'div',
            { class: 'tl-row', onClick: onSelect },
            h('span', { class: 'tl-name', title: label }, label),
            track,
          ),
        );
      };

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
        renderRow(id, meta.role, segments, () => {
          store.set(s => ({
            ...s,
            selection: { kind: 'node', id },
            ui: { ...s.ui, inspectorOpen: true, tab: 'node' },
          }));
        });

        // Expand map unit sub-rows if lane telemetry timestamps exist
        if (meta.shape === 'map') {
          for (const lane of view.lanes || []) {
            if (lane.blueprint || !lane.startedAt) continue;
            renderRow(
              `  └ ${lane.id}`,
              'worker',
              [
                {
                  start: lane.startedAt,
                  end: lane.finishedAt,
                  status: lane.status === 'fail' ? 'fail' : 'ok',
                  running: lane.status === 'running' && view.state === 'running',
                },
              ],
              () => {
                store.set(s => ({
                  ...s,
                  selection: { kind: 'lane', id: lane.id },
                  ui: { ...s.ui, inspectorOpen: true, tab: 'node' },
                }));
              },
            );
          }
        }
      }

      tlEl.appendChild(body);
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
