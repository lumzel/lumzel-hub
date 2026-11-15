import { createStore, INITIAL_STATE } from './store.js';
import { applyI18n, t } from './i18n.js';
import { setAttr, setText } from './lib/dom.js';
import { createDemoPlayer } from './demo/player.js';
import { createHost } from './host.js';
import { mountHeader } from './views/header.js';
import { mountCommandBar } from './views/commandBar.js';
import { mountStrip } from './views/strip.js';
import { mountGraph } from './views/graph.js';
import { mountGateDock } from './views/gateDock.js';
import { mountInspector } from './views/inspector.js';
import { mountTimeline } from './views/timeline.js';

function showFatalBanner(err) {
  const bannerEl = document.getElementById('banner');
  if (!bannerEl) return;
  bannerEl.hidden = false;
  bannerEl.setAttribute('data-tone', 'fail');
  bannerEl.textContent = `UI error: ${String((err && err.message) || err || 'unknown')}`;
}

async function boot() {
  const store = createStore(INITIAL_STATE);
  const demo = createDemoPlayer(store);
  const host = createHost(store, demo);

  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  // Mount views
  mountHeader(store, host);
  mountCommandBar(store, host);
  mountStrip(store);
  const graphApi = mountGraph(store, host);
  mountGateDock(store);
  mountInspector(store, host);
  mountTimeline(store, host);

  // Root state bindings
  store.subscribe(
    s => s.mode,
    mode => setAttr(appEl, 'data-mode', mode),
  );

  store.subscribe(
    s => s.ctx.locale,
    () => applyI18n(),
  );

  store.subscribe(
    s => s.toast,
    msg => {
      toastEl.hidden = !msg;
      setText(toastEl, msg || '');
    },
  );

  // Global keyboard shortcuts (§7.3)
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      host.startRun();
      return;
    }

    if (e.key === 'Escape') {
      const checksPop = document.getElementById('checks-pop');
      const demoPop = document.getElementById('demo-pop');
      if (checksPop && !checksPop.hidden) {
        checksPop.hidden = true;
        return;
      }
      if (demoPop && !demoPop.hidden) {
        demoPop.hidden = true;
        return;
      }
      store.set({ selection: null });
      return;
    }

    if (isTyping) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      graphApi.fitViewport(true);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      graphApi.zoomBy(1.15);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      graphApi.zoomBy(1 / 1.15);
    } else if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      host.savePrefs({ inspectorOpen: !store.get().ui.inspectorOpen });
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      host.savePrefs({ timelineOpen: !store.get().ui.timelineOpen });
    }
  });

  applyI18n();
  await host.init();

  // Wait for fonts & next animation frame so preview captures are rock-solid
  if (document.fonts && document.fonts.ready) {
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 400))]);
  }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.documentElement.dataset.ready = '1';
}

window.addEventListener('error', e => showFatalBanner(e.error || e.message));
window.addEventListener('unhandledrejection', e => showFatalBanner(e.reason));

boot().catch(showFatalBanner);
