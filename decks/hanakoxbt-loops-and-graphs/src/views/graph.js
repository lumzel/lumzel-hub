import { h, s, clear, setAttr, setText } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { t } from '../i18n.js';
import { derive } from '../runModel.js';
import { getTopology } from '../topology/index.js';
import { box, roundedPath, fit, clamp, layered } from '../topology/layout.js';
import { createLanesRenderer } from './lanes.js';

const GLYPHS = {
  split: 'M7 2v4M7 6L3 11M7 6l4 5',
  worker: 'M2.5 2.5h9v9h-9zM5 7h4',
  shell: 'M3 4l3 3-3 3M8 10.5h3',
  human: 'M7 1.5L12.5 7 7 12.5 1.5 7Z',
  learn: 'M3 10c2-5 6-5 8-8M9 2h2v2',
};

function createMarker(id, fillColor) {
  const m = s('marker', {
    id,
    viewBox: '0 0 10 10',
    refX: 8.5,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse',
  });
  m.appendChild(s('path', { d: 'M1.5 2L8.5 5 1.5 8Z', fill: fillColor }));
  return m;
}

export function mountGraph(store, host) {
  const canvasEl = document.getElementById('canvas');
  const svgEl = document.getElementById('graph');
  const defsEl = document.getElementById('defs');
  const vpEl = document.getElementById('vp');
  const bandsEl = document.getElementById('l-bands');
  const edgesEl = document.getElementById('l-edges');
  const mapEl = document.getElementById('l-map');
  const nodesEl = document.getElementById('l-nodes');
  const toolsEl = document.getElementById('tools');
  const legendEl = document.getElementById('legend');
  const hintEl = document.getElementById('hint');
  const bannerEl = document.getElementById('banner');
  const verdictEl = document.getElementById('verdict-card');

  // Build <defs> once
  clear(defsEl);
  const hatch = s('pattern', {
    id: 'hatch',
    width: 6,
    height: 6,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  hatch.appendChild(s('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--skip)', 'stroke-width': 1.5 }));
  defsEl.append(
    hatch,
    createMarker('arrow-flow', 'var(--line-strong)'),
    createMarker('arrow-flow-done', 'var(--ink-2)'),
    createMarker('arrow-correct', 'var(--correct)'),
    createMarker('arrow-learn', 'var(--learn)'),
    createMarker('arrow-fail', 'var(--faint)'),
  );

  const lanesRenderer = createLanesRenderer(mapEl, store, host);

  // Viewport transform state
  let vp = { k: 1, tx: 0, ty: 0 };
  let worldDim = { width: 960, height: 640 };
  let currentLayout = null;
  let currentTopo = null;
  let builtTopoKey = null;
  let nodeRefs = new Map();
  let edgeRefs = new Map();
  let inletLblEl = null;
  let bandTextEls = [];
  let legendOpen = false;
  let followAnimId = null;

  function applyTransform() {
    vpEl.setAttribute('transform', `translate(${vp.tx.toFixed(2)},${vp.ty.toFixed(2)}) scale(${vp.k.toFixed(4)})`);
    svgEl.classList.toggle('lod-low', vp.k < 0.72);
    // Sync architectural dot/grid canvas background (§6.4)
    const minor = 16 * vp.k;
    const major = 128 * vp.k;
    canvasEl.style.backgroundSize = `${minor}px ${minor}px, ${major}px ${major}px, ${major}px ${major}px`;
    canvasEl.style.backgroundPosition = `${vp.tx}px ${vp.ty}px, ${vp.tx}px ${vp.ty}px, ${vp.tx}px ${vp.ty}px`;
    updateZoomLabel();
    positionVerdictCard();
  }

  function positionVerdictCard() {
    if (!currentLayout || !currentLayout.verdict || verdictEl.hidden) return;
    const vx = currentLayout.verdict.x * vp.k + vp.tx;
    const vy = currentLayout.verdict.y * vp.k + vp.ty;
    verdictEl.style.transform = `translate(${vx.toFixed(1)}px, ${vy.toFixed(1)}px) scale(${vp.k.toFixed(4)})`;
  }

  function getInsetRight() {
    return 0;
  }

  function fitViewport(animate = false) {
    const rect = canvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const target = fit(rect.width, rect.height, worldDim, getInsetRight());
    if (!animate) {
      vp = target;
      applyTransform();
      return;
    }
    animateViewportTo(target);
  }

  function animateViewportTo(target, duration = 240) {
    if (followAnimId) cancelAnimationFrame(followAnimId);
    const start = { ...vp };
    const t0 = performance.now();
    const ease = x => 1 - Math.pow(1 - x, 3);
    function step(now) {
      const p = Math.min(1, (now - t0) / duration);
      const e = ease(p);
      vp = {
        k: start.k + (target.k - start.k) * e,
        tx: start.tx + (target.tx - start.tx) * e,
        ty: start.ty + (target.ty - start.ty) * e,
      };
      applyTransform();
      if (p < 1) followAnimId = requestAnimationFrame(step);
      else followAnimId = null;
    }
    followAnimId = requestAnimationFrame(step);
  }

  function centerActiveIfOutside(view) {
    if (!store.get().ui.follow || !currentLayout || !view || view.blueprint) return;
    const rect = canvasEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const insetR = getInsetRight();
    const visW = rect.width - insetR;
    const visH = rect.height - (view.gate ? 64 : 0);

    // Find active node (waiting human_gate or running node)
    const activeNode =
      Object.values(view.nodes).find(n => n.status === 'waiting') ||
      Object.values(view.nodes).find(n => n.status === 'running');
    if (!activeNode || !currentLayout.nodes[activeNode.id]) return;

    const nb = box(currentLayout.nodes[activeNode.id]);
    const sx1 = nb.x * vp.k + vp.tx;
    const sy1 = nb.y * vp.k + vp.ty;
    const sx2 = (nb.x + nb.w) * vp.k + vp.tx;
    const sy2 = (nb.y + nb.h) * vp.k + vp.ty;

    const outLeft = Math.max(0, 20 - sx1);
    const outRight = Math.max(0, sx2 - (visW - 20));
    const outTop = Math.max(0, 20 - sy1);
    const outBottom = Math.max(0, sy2 - (visH - 20));
    const sw = sx2 - sx1;
    const sh = sy2 - sy1;
    if (outLeft > sw * 0.3 || outRight > sw * 0.3 || outTop > sh * 0.3 || outBottom > sh * 0.3) {
      const targetTx = visW / 2 - (nb.x + nb.w / 2) * vp.k;
      const targetTy = visH / 2 - (nb.y + nb.h / 2) * vp.k;
      animateViewportTo({ k: vp.k, tx: targetTx, ty: targetTy });
    }
  }

  function zoomBy(factor, cx, cy) {
    const rect = canvasEl.getBoundingClientRect();
    const px = cx !== undefined ? cx - rect.left : rect.width / 2;
    const py = cy !== undefined ? cy - rect.top : rect.height / 2;
    const nextK = clamp(vp.k * factor, 0.4, 2.2);
    const ratio = nextK / vp.k;
    vp = {
      k: nextK,
      tx: px - (px - vp.tx) * ratio,
      ty: py - (py - vp.ty) * ratio,
    };
    applyTransform();
  }

  function disableFollowOnUserPan() {
    if (store.get().ui.follow) {
      host.savePrefs({ follow: false });
    }
  }

  // Canvas Tools toolbar
  let zoomValEl = null;
  let followBtnEl = null;

  function renderTools() {
    clear(toolsEl);
    zoomValEl = h('span', { class: 'zoom-val mono' }, `${Math.round(vp.k * 100)}%`);
    followBtnEl = h(
      'button',
      {
        type: 'button',
        class: 'ghost follow-btn',
        'aria-pressed': store.get().ui.follow ? 'true' : 'false',
        onClick: () => {
          const next = !store.get().ui.follow;
          host.savePrefs({ follow: next });
          if (next) fitViewport(true);
        },
      },
      h('i', { class: 'dot' }),
      h('span', null, t('follow')),
    );
    toolsEl.append(
      h('button', { type: 'button', class: 'ghost', onClick: () => zoomBy(1 / 1.15) }, '−'),
      zoomValEl,
      h('button', { type: 'button', class: 'ghost', onClick: () => zoomBy(1.15) }, '+'),
      h(
        'button',
        {
          type: 'button',
          class: 'ghost',
          onClick: () => fitViewport(true),
        },
        t('fit'),
      ),
      followBtnEl,
    );
  }

  function updateZoomLabel() {
    if (zoomValEl) setText(zoomValEl, `${Math.round(vp.k * 100)}%`);
  }

  function renderLegend() {
    clear(legendEl);
    const toggleBtn = h(
      'button',
      {
        type: 'button',
        class: 'ghost legend-toggle',
        onClick: () => {
          legendOpen = !legendOpen;
          renderLegend();
        },
      },
      h('span', null, t('legend')),
      h('span', { class: 'mono' }, legendOpen ? '⌃' : '⌄'),
    );
    legendEl.appendChild(toggleBtn);
    if (!legendOpen) return;

    const rows = [
      ['legendSplit', '<rect x="1" y="1" width="16" height="8" rx="2" fill="var(--split-soft)" stroke="var(--split)" stroke-width="1.2"/>'],
      ['legendWorker', '<rect x="1" y="1" width="16" height="8" rx="2" fill="var(--worker-soft)" stroke="var(--worker)" stroke-width="1.2"/>'],
      ['legendCode', '<rect x="1" y="2" width="16" height="6" rx="3" fill="var(--code-soft)" stroke="var(--code)" stroke-width="1.2"/>'],
      ['legendGate', '<polygon points="9,0.5 14,5 9,9.5 4,5" fill="var(--gate-soft)" stroke="var(--gate)" stroke-width="1.2"/>'],
      ['legendCorrect', '<line x1="1" y1="5" x2="17" y2="5" stroke="var(--correct)" stroke-width="1.4" stroke-dasharray="4 2.5"/>'],
      ['legendLearn', '<line x1="1" y1="5" x2="17" y2="5" stroke="var(--learn)" stroke-width="1.8" stroke-dasharray="1 4" stroke-linecap="round"/>'],
    ];

    const list = h('div', { class: 'legend-list' });
    for (const [key, svgInner] of rows) {
      const sw = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sw.setAttribute('class', 'legend-swatch');
      sw.setAttribute('viewBox', '0 0 18 10');
      sw.innerHTML = svgInner;
      list.appendChild(h('div', { class: 'legend-row' }, sw, h('span', null, t(key))));
    }
    legendEl.appendChild(list);
  }

  // Pan & zoom interactions
  let dragging = false;
  let moved = false;
  let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };

  svgEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.node, .lane, .inlet')) return;
    dragging = true;
    moved = false;
    dragStart = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty };
    svgEl.classList.add('panning');
    try {
      svgEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  });

  svgEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.hypot(dx, dy) > 3) {
      moved = true;
      disableFollowOnUserPan();
    }
    vp = { ...vp, tx: dragStart.tx + dx, ty: dragStart.ty + dy };
    applyTransform();
  });

  svgEl.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    svgEl.classList.remove('panning');
    try {
      svgEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!moved && !e.target.closest('.node, .lane, .inlet')) {
      store.set({ selection: null });
    }
  });

  svgEl.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      } else {
        disableFollowOnUserPan();
        vp = { ...vp, tx: vp.tx - e.deltaX, ty: vp.ty - e.deltaY };
        applyTransform();
      }
    },
    { passive: false },
  );

  // Keyboard arrow navigation along topology ADJACENT graph
  svgEl.addEventListener('keydown', e => {
    const dirMap = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
    const dir = dirMap[e.key];
    if (!dir || !currentTopo) return;
    const curEl = document.activeElement && document.activeElement.closest('.node');
    const curId = (curEl && curEl.dataset.id) || (store.get().selection && store.get().selection.id);
    const nextId = curId && currentTopo.ADJACENT[curId] && currentTopo.ADJACENT[curId][dir];
    if (!nextId) return;
    e.preventDefault();
    const targetEl = nodesEl.querySelector(`.node[data-id="${nextId}"]`) || mapEl.querySelector(`.lane`);
    if (targetEl) targetEl.focus();
    store.set({ selection: { kind: 'node', id: nextId } });
  });

  // ResizeObserver for canvas (§8.5)
  let resizeScheduled = false;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (resizeScheduled) return;
      resizeScheduled = true;
      requestAnimationFrame(() => {
        resizeScheduled = false;
        if (store.get().ui.follow) fitViewport(false);
        else applyTransform();
      });
    });
    ro.observe(canvasEl);
  }

  function makeNodeElement(id, coords, meta) {
    const g = s('g', {
      class: coords.shape === 'gate' ? 'node gate-diamond' : 'node',
      'data-id': id,
      'data-role': meta.role,
      'data-status': 'queued',
      'data-selected': 'false',
      tabindex: '0',
      role: 'button',
      'aria-label': `${id} · ${meta.kind} · queued`,
    });

    g.addEventListener('click', e => {
      e.stopPropagation();
      const targetTab = id === 'human_gate' && store.get().run?.state === 'waiting_gate' ? 'gate' : 'node';
      store.set(st => ({
        ...st,
        selection: { kind: 'node', id },
        ui: { ...st.ui, inspectorOpen: true, tab: targetTab },
      }));
    });
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

    if (coords.shape === 'gate') {
      g.setAttribute('transform', `translate(${coords.cx},${coords.cy})`);
      g.appendChild(s('polygon', { class: 'n-ring', points: '0,-18 18,0 0,18 -18,0' }));
      g.appendChild(s('polygon', { class: 'n-body', points: '0,-14 14,0 0,14 -14,0' }));
      g.appendChild(s('circle', { cx: 0, cy: 0, r: 2, fill: 'var(--gate)' }));
      const lbl = coords.lbl || { x: 0, y: 25, align: 'middle' };
      g.appendChild(s('text', { class: 'g-lbl', x: lbl.x, y: lbl.y, 'text-anchor': lbl.align || 'middle' }, id));
      return { g, statusEl: null, meterEl: null, badgeEl: null };
    }

    if (coords.shape === 'pill') {
      g.setAttribute('transform', `translate(${coords.x},${coords.y})`);
      g.appendChild(s('rect', { class: 'n-ring', x: -3.5, y: -3.5, width: 119, height: 37, rx: 18 }));
      g.appendChild(s('rect', { class: 'n-body', width: 112, height: 30, rx: 15 }));
      const glyph = s('g', { class: 'n-glyph', transform: 'translate(10,8)' });
      if (meta.role === 'shell') {
        glyph.appendChild(s('path', { d: GLYPHS.shell }));
      } else if (meta.role === 'worker') {
        glyph.appendChild(s('path', { d: GLYPHS.worker }));
      } else {
        glyph.appendChild(s('text', { x: 4, y: 11 }, 'ƒ'));
      }
      const titleEl = s('text', { class: 'n-title', x: 30, y: 19 }, id);
      const badgeEl = s('text', { class: 'n-badge', x: 100, y: 19, 'text-anchor': 'end' });
      g.append(glyph, titleEl, badgeEl);
      return { g, statusEl: null, meterEl: null, badgeEl };
    }

    const isHuman = coords.shape === 'human';
    const w = isHuman ? 184 : 148;
    const hVal = isHuman ? 72 : 56;
    g.setAttribute('transform', `translate(${coords.x},${coords.y})`);
    g.appendChild(s('rect', { class: 'n-ring', x: -3.5, y: -3.5, width: w + 7, height: hVal + 7, rx: 8 }));
    g.appendChild(s('rect', { class: 'n-body', width: w, height: hVal, rx: 5 }));
    if (isHuman) {
      g.appendChild(s('rect', { class: 'n-inner', x: 3, y: 3, width: w - 6, height: hVal - 6, rx: 3 }));
    }
    g.appendChild(s('rect', { class: 'n-tick', x: 0, y: 10, width: 2, height: hVal - 20, rx: 1 }));

    const glyph = s('g', { class: 'n-glyph', transform: `translate(12,${isHuman ? 15 : 12})` });
    if (meta.role === 'code') {
      glyph.appendChild(s('text', { x: 3, y: 11 }, 'ƒ'));
    } else if (isHuman) {
      glyph.appendChild(s('path', { d: GLYPHS.human }));
      glyph.appendChild(s('circle', { cx: 7, cy: 7, r: 1.5, fill: 'var(--gate)' }));
    } else {
      glyph.appendChild(s('path', { d: GLYPHS[meta.role] || GLYPHS.worker }));
    }

    const titleY = isHuman ? 26 : 23;
    const sepY = isHuman ? 38 : 32;
    const botY = isHuman ? 56 : 46;

    const titleEl = s('text', { class: 'n-title', x: 32, y: titleY }, id);
    const kindEl = s('text', { class: 'n-kind', x: w - 12, y: titleY, 'text-anchor': 'end' }, meta.kind);
    const badgeEl = s('text', { class: 'n-badge', x: w - 7, y: 12, 'text-anchor': 'end' });
    const sep = s('line', { class: 'n-sep', x1: 12, x2: w - 12, y1: sepY, y2: sepY });
    const statusEl = s('text', { class: 'n-status', x: 12, y: botY }, 'queued');
    const meterEl = s('text', { class: 'n-meter', x: w - 12, y: botY, 'text-anchor': 'end' });

    g.append(glyph, titleEl, kindEl, badgeEl, sep, statusEl, meterEl);
    return { g, statusEl, meterEl, badgeEl };
  }

  function buildTopologySkeleton(preset, lanesCount, unknownNodes, view) {
    const topo = getTopology(preset);
    const base = topo.layout(lanesCount);
    const extra = layered(unknownNodes, base);
    const fullNodes = { ...base.nodes, ...extra.nodes };
    currentLayout = { ...base, nodes: fullNodes, width: extra.width, height: extra.height };
    currentTopo = topo;
    worldDim = { width: currentLayout.width, height: currentLayout.height };

    clear(bandsEl);
    bandTextEls = [];
    for (const b of base.bands || []) {
      const txt = s('text', { class: 'band-label', x: 72, y: b.y }, t(b.key));
      bandsEl.appendChild(txt);
      bandTextEls.push({ key: b.key, el: txt });
    }

    clear(edgesEl);
    edgeRefs = new Map();
    const edges = topo.buildEdges(base, view);
    for (const e of edges) {
      const d = roundedPath(e.pts, 8);
      const eg = s('g', {
        class: 'edge',
        'data-id': e.id,
        'data-kind': e.kind,
        'data-state': 'idle',
      });
      const marker =
        e.kind === 'correct'
          ? 'url(#arrow-correct)'
          : e.kind === 'learn'
            ? 'url(#arrow-learn)'
            : e.kind === 'fail'
              ? 'url(#arrow-fail)'
              : 'url(#arrow-flow)';
      const basePath = s('path', { class: 'e-base', d, 'marker-end': marker });
      const flowPath = s('path', { class: 'e-flow', d });
      eg.append(basePath, flowPath);
      let lblEl = null;
      if (e.label) {
        lblEl = s(
          'text',
          { class: 'e-label', x: e.label.x, y: e.label.y, 'text-anchor': e.label.align || 'middle' },
          e.label.text,
        );
        eg.appendChild(lblEl);
      }
      edgesEl.appendChild(eg);
      edgeRefs.set(e.id, { eg, basePath, flowPath, lblEl, def: e });
    }

    // Learning Edge inlet socket at preflight/scope left midpoint
    if (base.inlet) {
      const ig = s('g', {
        class: 'inlet',
        tabindex: '0',
        role: 'button',
        'aria-label': 'Constraints Vault inlet',
      });
      ig.addEventListener('click', e => {
        e.stopPropagation();
        host.savePrefs({ inspectorOpen: true, tab: 'vault' });
      });
      ig.appendChild(s('circle', { class: 'inlet-ring', cx: base.inlet.x, cy: base.inlet.y, r: 4 }));
      inletLblEl = s('text', {
        class: 'inlet-label',
        x: 30,
        y: base.inlet.y + 39,
        'text-anchor': 'start',
      });
      ig.appendChild(inletLblEl);
      edgesEl.appendChild(ig);
    }

    clear(nodesEl);
    nodeRefs = new Map();
    for (const [id, coords] of Object.entries(fullNodes)) {
      if (coords.shape === 'map') continue; // rendered in #l-map
      const meta = topo.META[id] || { role: 'code', kind: 'NODE', shape: coords.shape, max: 1 };
      const ref = makeNodeElement(id, coords, meta);
      nodesEl.appendChild(ref.g);
      nodeRefs.set(id, ref);
    }

    if (store.get().ui.follow) fitViewport(false);
  }

  function updateVerdictCard(view) {
    if (view.preset !== 'code-review' || !currentLayout || !currentLayout.verdict) {
      verdictEl.hidden = true;
      return;
    }
    verdictEl.hidden = false;
    clear(verdictEl);
    const v = view.verdict;
    verdictEl.appendChild(h('div', { class: 'verdict-kicker' }, 'REVIEW VERDICT'));
    if (!v) {
      verdictEl.appendChild(h('div', { class: 'verdict-word', style: { color: 'var(--faint)' } }, '—'));
      verdictEl.appendChild(h('div', { class: 'verdict-counts' }, h('span', null, 'H —'), h('span', null, 'M —'), h('span', null, 'L —')));
    } else {
      verdictEl.appendChild(h('div', { class: `verdict-word ${v.verdict}` }, v.verdict.toUpperCase()));
      verdictEl.appendChild(
        h(
          'div',
          { class: 'verdict-counts' },
          h('span', null, `H ${v.counts.high}`),
          h('span', null, `M ${v.counts.medium}`),
          h('span', null, `L ${v.counts.low}`),
        ),
      );
    }
    positionVerdictCard();
  }

  function updateHintAndBanner(st, view) {
    // Hint in idle mode
    const showHint = st.mode === 'idle' && !st.run && !st.banner;
    hintEl.hidden = !showHint;
    if (showHint) {
      clear(hintEl);
      hintEl.appendChild(
        document.createTextNode(st.preset === 'code-review' ? `${t('hintReview')} ` : `${t('hintShip')} `),
      );
      hintEl.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'link-btn',
            onClick: () => host.demo.start(st.preset),
          },
          t('hintDemoLink'),
        ),
      );
      hintEl.appendChild(document.createTextNode(` ${t('hintTail')}`));
    }

    // Banner: inspect banner takes priority or st.banner
    if (st.mode === 'inspect' && st.run) {
      bannerEl.hidden = false;
      setAttr(bannerEl, 'data-tone', 'info');
      clear(bannerEl);
      bannerEl.appendChild(
        h(
          'span',
          { class: 'banner-msg' },
          t('viewingRun', { id: st.run.runId.slice(0, 4), time: fmtDuration(view.elapsedSec) }),
        ),
      );
      bannerEl.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'secondary',
            onClick: () => host.backToLive(),
          },
          t('backToLive'),
        ),
      );
      return;
    }

    if (st.banner) {
      bannerEl.hidden = false;
      setAttr(bannerEl, 'data-tone', st.banner.tone || 'warn');
      clear(bannerEl);
      bannerEl.appendChild(h('span', { class: 'banner-msg' }, st.banner.text));
      if (st.banner.action) {
        bannerEl.appendChild(
          h(
            'button',
            { type: 'button', class: 'secondary', disabled: Boolean(st.pending), onClick: st.banner.action.fn },
            st.banner.action.label,
          ),
        );
      }
      return;
    }

    if (st.mode === 'live' && st.run && st.run.state === 'failed' && st.run.detail) {
      bannerEl.hidden = false;
      setAttr(bannerEl, 'data-tone', 'fail');
      clear(bannerEl);
      bannerEl.appendChild(h('span', { class: 'banner-msg' }, st.run.detail));
      return;
    }

    bannerEl.hidden = true;
  }

  renderTools();
  renderLegend();

  store.subscribe(
    s => s.ui.follow,
    follow => {
      if (followBtnEl) setAttr(followBtnEl, 'aria-pressed', follow ? 'true' : 'false');
    },
  );

  let prevViewState = null;
  let prevSlice = null;

  store.subscribe(
    s => ({
      run: s.run,
      mode: s.mode,
      preset: s.preset,
      pending: s.pending,
      telemetryRev: s.telemetry.rev,
      lessonsRev: s.lessons.rev,
      selection: s.selection,
      tick: s.ui.tick,
      locale: s.ctx.locale,
      banner: s.banner,
      wf: s.workflows[s.preset],
      inspectorOpen: s.ui.inspectorOpen,
    }),
    slice => {
      const st = store.get();
      const nowSec = st.ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(slice.run, slice.preset, slice.telemetryRev, st.telemetry.byUnit, nowSec);

      const isTickOnly =
        Boolean(builtTopoKey) &&
        prevSlice !== null &&
        prevSlice.run === slice.run &&
        prevSlice.mode === slice.mode &&
        prevSlice.preset === slice.preset &&
        prevSlice.pending === slice.pending &&
        prevSlice.telemetryRev === slice.telemetryRev &&
        prevSlice.lessonsRev === slice.lessonsRev &&
        prevSlice.selection === slice.selection &&
        prevSlice.locale === slice.locale &&
        prevSlice.banner === slice.banner &&
        prevSlice.wf === slice.wf &&
        prevSlice.inspectorOpen === slice.inspectorOpen;

      prevSlice = slice;

      if (isTickOnly) {
        // Fast path on 1Hz tick: patch only elapsed duration text nodes in place
        for (const [nid, nr] of nodeRefs.entries()) {
          if (!nr.meterEl) continue;
          const nv = view.nodes[nid];
          if (!nv || nv.startedAt === null || nv.finishedAt !== null) continue;
          const iterPart = nv.iteration > 0 ? `${nv.iteration}/${nv.max}` : '';
          const durPart = nv.durationSec !== null ? fmtDuration(nv.durationSec) : '';
          setText(nr.meterEl, [iterPart, durPart].filter(Boolean).join(' · '));
        }
        lanesRenderer.patchTick(view);
        return;
      }

      const unknownNodes = (slice.wf && slice.wf.unknownNodes) || [];
      const topoKey = `${view.preset}|${view.lanes.length}|${unknownNodes.join(',')}|${slice.locale}`;

      if (topoKey !== builtTopoKey) {
        buildTopologySkeleton(view.preset, view.lanes.length, unknownNodes, view);
        builtTopoKey = topoKey;
        renderTools();
        renderLegend();
      }

      // Update band translations
      for (const b of bandTextEls) setText(b.el, t(b.key));

      // Update inlet constraint count
      if (inletLblEl) {
        const injectedCount =
          view.summary.constraints !== null && view.summary.constraints !== undefined
            ? view.summary.constraints
            : host.lessons.getActiveForPreset(view.preset).length;
        setText(inletLblEl, t('constraintsInlet', { n: injectedCount }));
      }

      // Diff-patch edges
      const dynamicEdges = currentTopo.buildEdges(currentLayout, view);
      const dynamicById = new Map(dynamicEdges.map(e => [e.id, e]));
      for (const [eid, er] of edgeRefs.entries()) {
        const ed = dynamicById.get(eid);
        if (ed) {
          const nextD = roundedPath(ed.pts, 8);
          setAttr(er.basePath, 'd', nextD);
          setAttr(er.flowPath, 'd', nextD);
          if (er.lblEl && ed.label) {
            setText(er.lblEl, ed.label.text);
            setAttr(er.lblEl, 'x', ed.label.x);
            setAttr(er.lblEl, 'y', ed.label.y);
          }
        }
        const edgeState = view.edges[eid] || 'idle';
        setAttr(er.eg, 'data-state', edgeState);
        if (er.def.kind === 'flow') {
          setAttr(
            er.basePath,
            'marker-end',
            edgeState === 'done' || edgeState === 'active' ? 'url(#arrow-flow-done)' : 'url(#arrow-flow)',
          );
        }
      }

      // Diff-patch map lanes
      const mapId = view.preset === 'code-review' ? 'lenses' : 'units';
      const mapBox = box(currentLayout.nodes[mapId]);
      lanesRenderer.update(view, mapBox, currentTopo, slice.selection);

      // Diff-patch nodes
      for (const [nid, nr] of nodeRefs.entries()) {
        const nv = view.nodes[nid];
        if (!nv) continue;
        const selected = Boolean(slice.selection && slice.selection.kind === 'node' && slice.selection.id === nid);
        setAttr(nr.g, 'data-status', nv.status);
        setAttr(nr.g, 'data-selected', selected ? 'true' : 'false');
        setAttr(nr.g, 'aria-label', `${nid} · ${nv.kind} · ${nv.status}`);
        if (nr.statusEl) setText(nr.statusEl, nv.status);
        if (nr.meterEl) {
          const iterPart = nv.iteration > 0 ? `${nv.iteration}/${nv.max}` : '';
          const durPart = nv.durationSec !== null ? fmtDuration(nv.durationSec) : '';
          setText(nr.meterEl, [iterPart, durPart].filter(Boolean).join(' · '));
        }
        if (nr.badgeEl) {
          setText(nr.badgeEl, nv.status === 'ok' ? '✓' : nv.status === 'fail' ? '✗' : nv.status === 'waiting' ? '◆' : '');
        }
      }

      updateVerdictCard(view);
      updateHintAndBanner(st, view);

      if (prevViewState !== view.state) {
        if (view.state === 'waiting_gate' || view.state === 'running') {
          centerActiveIfOutside(view);
        }
        prevViewState = view.state;
      }
    },
    (a, b) =>
      a.run === b.run &&
      a.mode === b.mode &&
      a.preset === b.preset &&
      a.pending === b.pending &&
      a.telemetryRev === b.telemetryRev &&
      a.lessonsRev === b.lessonsRev &&
      a.selection === b.selection &&
      a.tick === b.tick &&
      a.locale === b.locale &&
      a.banner === b.banner &&
      a.wf === b.wf &&
      a.inspectorOpen === b.inspectorOpen,
  );

  return {
    fitViewport,
    zoomBy,
  };
}
