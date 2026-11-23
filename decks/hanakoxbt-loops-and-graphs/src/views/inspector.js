import { h, setAttr } from '../lib/dom.js';
import { derive } from '../runModel.js';
import { isWideViewport } from '../topology/layout.js';
import { renderNodePanel } from './nodePanel.js';
import { createGatePanelRenderer } from './gatePanel.js';
import { createVaultRenderer } from './vault.js';
import { createHistoryRenderer } from './history.js';

export function mountInspector(store, host) {
  const appEl = document.getElementById('app');
  const inspEl = document.getElementById('insp');
  const scrimEl = document.getElementById('insp-scrim');
  const closeBtn = document.getElementById('insp-close-btn');
  const gripEl = document.getElementById('grip');
  const tabsEl = inspEl.querySelector('.tabs');
  const bodyEl = document.getElementById('insp-body');

  if (scrimEl) {
    scrimEl.addEventListener('click', () => {
      host.savePrefs({ inspectorOpen: false });
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      host.savePrefs({ inspectorOpen: false });
    });
  }

  const renderGatePanel = createGatePanelRenderer(store, host);
  const renderVault = createVaultRenderer(store, host);
  const renderHistory = createHistoryRenderer(store, host);

  // Add badge dot inside Gate tab button
  const gateTabBtn = tabsEl.querySelector('button[data-tab="gate"]');
  const gateBadge = h('i', { class: 'tab-badge', hidden: true });
  if (gateTabBtn) gateTabBtn.appendChild(gateBadge);

  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    host.savePrefs({ tab: btn.dataset.tab, inspectorOpen: true });
  });

  // 4px width drag resize (320-520px)
  let dragging = false;
  let startX = 0;
  let startW = 380;

  gripEl.addEventListener('pointerdown', e => {
    if (!isWideViewport()) return;
    dragging = true;
    startX = e.clientX;
    startW = inspEl.getBoundingClientRect().width || 380;
    gripEl.classList.add('dragging');
    try {
      gripEl.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  });

  gripEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    const nextW = Math.max(320, Math.min(520, Math.round(startW + dx)));
    document.documentElement.style.setProperty('--insp-w', `${nextW}px`);
  });

  gripEl.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    gripEl.classList.remove('dragging');
    try {
      gripEl.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const finalW = Math.max(320, Math.min(520, Math.round(inspEl.getBoundingClientRect().width || 380)));
    host.savePrefs({ inspectorWidth: finalW });
  });

  store.subscribe(
    s => ({
      open: s.ui.inspectorOpen,
      width: s.ui.inspectorWidth,
      tab: s.ui.tab,
      run: s.run,
    }),
    ({ open, width, tab, run }) => {
      setAttr(appEl, 'data-insp', open ? 'open' : 'closed');
      if (scrimEl) scrimEl.hidden = !open;
      if (width && isWideViewport()) {
        document.documentElement.style.setProperty('--insp-w', `${width}px`);
      }
      for (const btn of tabsEl.querySelectorAll('button[data-tab]')) {
        setAttr(btn, 'aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
      }
      gateBadge.hidden = !(run && run.state === 'waiting_gate');
    },
    (a, b) => a.open === b.open && a.width === b.width && a.tab === b.tab && a.run === b.run,
  );

  // Render active tab body cleanly without clobbering form inputs on 1Hz ticks
  store.subscribe(
    s => {
      const tab = s.ui.tab;
      if (!s.ui.inspectorOpen) return { open: false, tab };
      if (tab === 'vault') {
        return {
          open: true,
          tab,
          rev: s.lessons.rev,
          fileSync: s.fileSyncStatus,
          fileLen: (s.fileLessons || []).length,
          preset: s.preset,
          caps: s.caps,
          locale: s.ctx.locale,
        };
      }
      if (tab === 'history') {
        return {
          open: true,
          tab,
          history: s.history,
          run: s.run,
          capsDb: s.caps.db,
          locale: s.ctx.locale,
        };
      }
      if (tab === 'gate') {
        return {
          open: true,
          tab,
          run: s.run,
          pending: s.pending,
          preset: s.preset,
          locale: s.ctx.locale,
          // Don't rebuild on tick when user might have rework textarea open
          tickBucket: s.run && s.run.state === 'waiting_gate' ? 0 : s.ui.tick,
        };
      }
      // node tab
      return {
        open: true,
        tab,
        run: s.run,
        preset: s.preset,
        selection: s.selection,
        telemetryRev: s.telemetry.rev,
        caps: s.caps,
        locale: s.ctx.locale,
      };
    },
    slice => {
      if (!slice.open) return;
      const st = store.get();
      const nowSec = st.ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(st.run, st.preset, st.telemetry.rev, st.telemetry.byUnit, nowSec);

      if (slice.tab === 'node') {
        renderNodePanel(bodyEl, store, host, view);
      } else if (slice.tab === 'gate') {
        renderGatePanel(bodyEl, view);
      } else if (slice.tab === 'vault') {
        renderVault(bodyEl);
      } else if (slice.tab === 'history') {
        renderHistory(bodyEl);
      }
    },
    (a, b) => {
      if (!a.open && !b.open) return true;
      if (a.open !== b.open || a.tab !== b.tab) return false;
      for (const k of Object.keys(a)) {
        if (a[k] !== b[k]) return false;
      }
      return true;
    },
  );
}
