import { h, clear } from '../lib/dom.js';
import { fmtDuration } from '../lib/format.js';
import { derive } from '../runModel.js';
import { t } from '../i18n.js';

export function mountGateDock(store) {
  const dockEl = document.getElementById('gate-dock');

  store.subscribe(
    s => ({
      run: s.run,
      preset: s.preset,
      tab: s.ui.tab,
      inspOpen: s.ui.inspectorOpen,
      tick: s.ui.tick,
      locale: s.ctx.locale,
    }),
    ({ run, preset, tab, inspOpen }) => {
      const nowSec = store.get().ui.tick || Math.floor(Date.now() / 1000);
      const view = derive(run, preset, store.get().telemetry.rev, store.get().telemetry.byUnit, nowSec);
      const show = Boolean(view.gate && !(inspOpen && tab === 'gate'));
      dockEl.hidden = !show;
      if (!show) return;

      const g = view.gate;
      const cand = g.candidate || {};
      const title =
        cand.passed !== undefined
          ? `Ship ${cand.passed}/${cand.total} units into main?`
          : g.prompt || 'Human approval required';

      clear(dockEl);
      dockEl.appendChild(
        h(
          'div',
          { class: 'gate-dock-info' },
          h('span', { class: 'mono', style: { color: 'var(--gate)', fontWeight: '700' } }, '◆'),
          h(
            'div',
            { style: { minWidth: 0 } },
            h('div', { class: 'gate-dock-title' }, title),
            h(
              'div',
              { class: 'gate-dock-sub' },
              `${t('gateDockSub')} · ${fmtDuration(g.waitingSinceSec)}`,
            ),
          ),
        ),
      );
      dockEl.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'gate-primary',
            onClick: () => {
              store.set(s => ({
                ...s,
                selection: { kind: 'node', id: 'human_gate' },
                ui: { ...s.ui, inspectorOpen: true, tab: 'gate' },
              }));
            },
          },
          t('gateDockReview'),
        ),
      );
    },
    (a, b) =>
      a.run === b.run &&
      a.preset === b.preset &&
      a.tab === b.tab &&
      a.inspOpen === b.inspOpen &&
      a.tick === b.tick &&
      a.locale === b.locale,
  );
}
