import { s, clear, setAttr, setText } from '../lib/dom.js';
import { fmtDuration, truncatePx } from '../lib/format.js';
import { t } from '../i18n.js';

const FONT_ID = "600 11.5px 'SF Mono', ui-monospace, Menlo, Consolas, monospace";
const FONT_TITLE = "400 11px -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif";
const FONT_BRANCH = "400 9.5px 'SF Mono', ui-monospace, Menlo, Consolas, monospace";

let measureCanvasCtx = null;
function measurePx(txt, font) {
  if (!measureCanvasCtx && typeof document !== 'undefined') {
    measureCanvasCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCanvasCtx) return String(txt || '').length * 7;
  measureCanvasCtx.font = font;
  return measureCanvasCtx.measureText(String(txt || '')).width;
}

export function createLanesRenderer(layerEl, store, host) {
  let builtKey = null;
  let refs = null;

  function buildSkeleton(preset, mapBox, lanes, topo) {
    clear(layerEl);
    const LANE = topo.LANE;
    const PHASES = topo.PHASES;
    const isReview = preset === 'code-review';

    const root = s('g', { class: 'map-group' });
    root.appendChild(
      s('rect', {
        class: 'map-frame',
        x: mapBox.x,
        y: mapBox.y,
        width: mapBox.w,
        height: mapBox.h,
        rx: 5,
      }),
    );
    root.appendChild(
      s('rect', {
        class: 'map-tick',
        x: mapBox.x,
        y: mapBox.y + 8,
        width: 2,
        height: mapBox.h - 16,
        rx: 1,
      }),
    );
    root.appendChild(
      s('line', {
        class: 'map-head-sep',
        x1: mapBox.x,
        x2: mapBox.x + mapBox.w,
        y1: mapBox.y + LANE.head,
        y2: mapBox.y + LANE.head,
      }),
    );

    // Header chips
    const hx = mapBox.x + 12;
    const hy = mapBox.y + 9;
    root.appendChild(s('rect', { class: 'map-chip-rect', x: hx, y: hy, width: 32, height: 18, rx: 3 }));
    root.appendChild(s('text', { class: 'map-chip-txt', x: hx + 16, y: hy + 12.5, 'text-anchor': 'middle' }, 'MAP'));

    const titleEl = s(
      'text',
      { class: 'map-title', x: hx + 42, y: hy + 13 },
      `${isReview ? 'lenses' : 'units'} ×${lanes.length}`,
    );
    root.appendChild(titleEl);

    const concX = hx + 114;
    root.appendChild(s('rect', { class: 'map-chip-rect neutral', x: concX, y: hy, width: 34, height: 18, rx: 3 }));
    root.appendChild(
      s(
        'text',
        { class: 'map-chip-txt neutral', x: concX + 17, y: hy + 12.5, 'text-anchor': 'middle' },
        isReview ? '∥ 4' : '∥ 3',
      ),
    );

    const wtX = concX + 42;
    const wtText = isReview ? 'worktree: current' : 'worktree: isolated';
    const wtW = isReview ? 114 : 120;
    root.appendChild(s('rect', { class: 'map-chip-rect neutral', x: wtX, y: hy, width: wtW, height: 18, rx: 3 }));
    root.appendChild(
      s('text', { class: 'map-chip-txt neutral', x: wtX + wtW / 2, y: hy + 12.5, 'text-anchor': 'middle' }, wtText),
    );

    const summaryEl = s('text', {
      class: 'map-summary',
      x: mapBox.x + mapBox.w - 14,
      y: hy + 13,
      'text-anchor': 'end',
    });
    root.appendChild(summaryEl);

    const laneRefs = [];
    lanes.forEach((lane, idx) => {
      const ly = mapBox.y + LANE.head + idx * LANE.h;
      const g = s('g', {
        class: 'lane',
        'data-id': lane.id,
        'data-status': lane.status,
        'data-selected': 'false',
        tabindex: '0',
        role: 'button',
      });
      g.addEventListener('click', e => {
        e.stopPropagation();
        if (lane.blueprint) {
          store.set(s => ({
            ...s,
            selection: { kind: 'node', id: isReview ? 'lenses' : 'units' },
            ui: { ...s.ui, tab: 'node' },
          }));
          return;
        }
        store.set(s => ({
          ...s,
          selection: { kind: 'lane', id: lane.id },
          ui: { ...s.ui, inspectorOpen: true, tab: 'node' },
        }));
      });
      g.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });

      g.appendChild(
        s('rect', { class: 'lane-bg', x: mapBox.x + 2, y: ly, width: mapBox.w - 4, height: LANE.h }),
      );
      g.appendChild(
        s('rect', { class: 'lane-sel-tick', x: mapBox.x + 2, y: ly + 7, width: 2, height: LANE.h - 14, rx: 1 }),
      );
      if (idx > 0) {
        g.appendChild(
          s('line', { class: 'lane-div', x1: mapBox.x + 12, x2: mapBox.x + mapBox.w - 12, y1: ly, y2: ly }),
        );
      }

      g.appendChild(s('circle', { class: 'lane-dot', cx: mapBox.x + 14, cy: ly + 15.5, r: 3 }));
      const idEl = s('text', { class: 'lane-id', x: mapBox.x + 24, y: ly + 19 });
      const titleTextEl = s('text', { class: 'lane-title', x: mapBox.x + 110, y: ly + 19 });
      const branchEl = s('text', { class: 'lane-branch', x: mapBox.x + 24, y: ly + 33 });
      g.append(idEl, titleTextEl, branchEl);

      // Phase chips & connectors
      const phaseEls = [];
      for (let i = 0; i < PHASES.length; i++) {
        const cx = mapBox.x + LANE.chipX0 + i * (LANE.chipW + LANE.chipGap);
        if (i > 0) {
          const prevX = mapBox.x + LANE.chipX0 + (i - 1) * (LANE.chipW + LANE.chipGap) + LANE.chipW;
          g.appendChild(
            s('line', { class: 'phase-conn', x1: prevX, x2: cx, y1: ly + 22, y2: ly + 22 }),
          );
        }
        const pg = s('g', { class: 'phase', 'data-state': 'pending' });
        pg.appendChild(
          s('rect', { class: 'phase-rect', x: cx, y: ly + 12, width: LANE.chipW, height: LANE.chipH, rx: 3 }),
        );
        const pt = s(
          'text',
          { class: 'phase-txt', x: cx + LANE.chipW / 2, y: ly + 25.5, 'text-anchor': 'middle' },
          PHASES[i],
        );
        pg.appendChild(pt);
        g.appendChild(pg);
        phaseEls.push({ pg, pt, baseLabel: PHASES[i] });
      }

      // Internal correction arcs
      const chipCenter = i => mapBox.x + LANE.chipX0 + i * (LANE.chipW + LANE.chipGap) + LANE.chipW / 2;
      const arcs = [];
      if (isReview) {
        const c2 = chipCenter(2);
        const c0 = chipCenter(0);
        const arc = s('path', {
          class: 'lane-arc',
          'data-active': 'false',
          d: `M${c2},${ly + 32} C${c2},${ly + 42} ${c0},${ly + 42} ${c0},${ly + 32}`,
        });
        const lbl = s('text', { class: 'lane-arc-lbl', x: (c2 + c0) / 2, y: ly + 41.5, 'text-anchor': 'middle' });
        g.append(arc, lbl);
        arcs.push({ kind: 'evidence', arc, lbl });
      } else {
        const c1 = chipCenter(1);
        const c0 = chipCenter(0);
        const redArc = s('path', {
          class: 'lane-arc',
          'data-active': 'false',
          d: `M${c1},${ly + 32} C${c1},${ly + 42} ${c0},${ly + 42} ${c0},${ly + 32}`,
        });
        const redLbl = s('text', { class: 'lane-arc-lbl', x: (c1 + c0) / 2, y: ly + 41.5, 'text-anchor': 'middle' });
        const c3 = chipCenter(3);
        const c2 = chipCenter(2);
        const greenArc = s('path', {
          class: 'lane-arc',
          'data-active': 'false',
          d: `M${c3},${ly + 32} C${c3},${ly + 42} ${c2},${ly + 42} ${c2},${ly + 32}`,
        });
        const greenLbl = s('text', { class: 'lane-arc-lbl', x: (c3 + c2) / 2, y: ly + 41.5, 'text-anchor': 'middle' });
        g.append(redArc, redLbl, greenArc, greenLbl);
        arcs.push({ kind: 'red', arc: redArc, lbl: redLbl });
        arcs.push({ kind: 'green', arc: greenArc, lbl: greenLbl });
      }

      // Attempt squares (3 squares of 6x6, gap 3)
      const mx = mapBox.x + LANE.meterX;
      const sqs = [];
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const sq = s('rect', {
          class: 'attempt-sq',
          x: mx + sIdx * 9,
          y: ly + 19,
          width: 6,
          height: 6,
          rx: 1,
        });
        g.appendChild(sq);
        sqs.push(sq);
      }

      const meterEl = s('text', {
        class: 'lane-meter',
        x: mapBox.x + mapBox.w - 14,
        y: ly + 25.5,
        'text-anchor': 'end',
      });
      const conflictEl = s('text', {
        class: 'lane-conflict',
        x: mapBox.x + LANE.meterX,
        y: ly + 36,
      });
      g.append(meterEl, conflictEl);

      root.appendChild(g);
      laneRefs.push({
        g,
        idEl,
        titleTextEl,
        branchEl,
        phaseEls,
        arcs,
        sqs,
        meterEl,
        conflictEl,
      });
    });

    layerEl.appendChild(root);
    return { root, titleEl, summaryEl, laneRefs };
  }

  function update(view, mapBox, topo, selection) {
    const lanes = view.lanes || [];
    const key = `${view.preset}|${lanes.length}|${mapBox.w}|${mapBox.y}`;
    if (key !== builtKey || !refs) {
      refs = buildSkeleton(view.preset, mapBox, lanes, topo);
      builtKey = key;
    }

    const isReview = view.preset === 'code-review';
    const LANE = topo.LANE;
    setText(refs.titleEl, `${isReview ? 'lenses' : 'units'} ×${lanes.length}`);

    if (view.telemetryUnavailable) {
      setText(refs.summaryEl, t('telemetryOff'));
    } else if (view.blueprint) {
      setText(refs.summaryEl, 'blueprint');
    } else {
      const p = lanes.filter(l => l.status === 'pass').length;
      const f = lanes.filter(l => l.status === 'fail').length;
      const r = lanes.filter(l => l.status === 'running').length;
      const parts = [`${p} passed`];
      if (f) parts.push(`${f} failed`);
      if (r) parts.push(`${r} running`);
      setText(refs.summaryEl, parts.join(' · '));
    }

    lanes.forEach((lane, idx) => {
      const lr = refs.laneRefs[idx];
      if (!lr) return;

      const isSelected = Boolean(selection && selection.kind === 'lane' && selection.id === lane.id);
      setAttr(lr.g, 'data-id', lane.id);
      setAttr(lr.g, 'data-status', lane.status);
      setAttr(lr.g, 'data-selected', isSelected ? 'true' : 'false');
      setAttr(lr.g, 'aria-label', `${lane.id} · ${lane.status}`);

      // Truncate id & title without overlap
      const maxTotalPx = LANE.labelW - 32;
      const idText = truncatePx(lane.id, isReview ? 110 : 120, FONT_ID);
      const idW = measurePx(idText, FONT_ID);
      setText(lr.idEl, idText);

      const remPx = maxTotalPx - idW - 6;
      if (remPx >= 24 && lane.title && lane.title !== '—') {
        lr.titleTextEl.setAttribute('x', String(mapBox.x + 24 + idW + 6));
        setText(lr.titleTextEl, truncatePx(lane.title, remPx, FONT_TITLE));
      } else {
        setText(lr.titleTextEl, lane.blueprint ? '—' : '');
      }

      const branchStr = lane.branch || (lane.blueprint ? '' : lane.error ? lane.error : '');
      setText(lr.branchEl, truncatePx(branchStr, maxTotalPx, FONT_BRANCH));

      // Phases
      for (let i = 0; i < lr.phaseEls.length; i++) {
        const pe = lr.phaseEls[i];
        const st = (lane.phases && lane.phases[i]) || 'pending';
        setAttr(pe.pg, 'data-state', st);
        setText(pe.pt, st === 'pass' ? `${pe.baseLabel} ✓` : pe.baseLabel);
      }

      // Correction arcs
      for (const a of lr.arcs) {
        const list =
          a.kind === 'red'
            ? lane.attempts.red || []
            : a.kind === 'green'
              ? lane.attempts.green || []
              : lane.attempts.evidence || [];
        const active = list.length > 1;
        setAttr(a.arc, 'data-active', active ? 'true' : 'false');
        setText(a.lbl, active ? `×${list.length}` : '');
      }

      // Attempt squares
      const sqList = isReview
        ? lane.attempts.evidence || []
        : (lane.attempts.green && lane.attempts.green.length ? lane.attempts.green : lane.attempts.red) || [];
      const maxSq = isReview ? 2 : 3;
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const sq = lr.sqs[sIdx];
        if (sIdx >= maxSq) {
          sq.setAttribute('visibility', 'hidden');
          continue;
        }
        sq.setAttribute('visibility', 'visible');
        let st = sqList[sIdx] || null;
        if (!st && lane.status === 'running' && sIdx === sqList.length) {
          st = 'cur';
        }
        setAttr(sq, 'data-state', st);
      }

      const dur =
        lane.startedAt !== null && lane.startedAt !== undefined
          ? fmtDuration(
              Math.max(0, (lane.finishedAt !== null && lane.finishedAt !== undefined ? lane.finishedAt : view.nowSec) - lane.startedAt),
            )
          : '';
      const countTxt = sqList.length ? `${sqList.length}/${maxSq}` : '';
      const meterStr = [countTxt, dur].filter(Boolean).join('  ');
      setText(lr.meterEl, meterStr || (lane.blueprint ? '' : '0/' + maxSq));
      setText(lr.conflictEl, lane.conflict ? '⚠ conflict' : '');
    });
  }

  return { update };
}
