// Prototype runtime of the Spec Workbench Deck: makes docs/features/<id>/prototype.html walkable and linked to its design doc.
// The Deck loads it into every prototype it frames (runtime/worktree.js); a prototype on disk links nothing.
// Conventions the prototype follows:
//   <section data-doc-screen="<screen-id>" data-doc-title="<label>">   one per screen; one is visible at a time
//   data-goto="<screen-id>"                     on any clickable element: switch screen
//   data-doc-node="<doc-id>#<node-id>"         on screens and elements that map to a design Node
// With Link Design on (key L), a click selects the element and the Deck lists its design Node and tickets.
// The Trace comes from the Deck by postMessage (doc:trace, answering this page's doc:ready).
// ?embed=1&bare=1: the Deck draws the screen tabs and each screen's [data-doc-intro] paragraph itself.
(() => {
  const screens = [...document.querySelectorAll('[data-doc-screen]')];
  const query = new URLSearchParams(location.search);
  const embedded = query.has('embed');
  const bare = embedded && query.has('bare');
  // A prototype is shown by the Deck, which frames it with ?embed=1. Opened any other way it stays as written.
  if (!embedded) return;
  // Theme: the Lumzel page passes ?theme= and pushes changes; opened alone it follows the saved choice or the OS.
  // Prototypes style both themes with :root[data-theme="dark"].
  const saved = (() => {
    try {
      return localStorage.getItem('doc-theme');
    } catch {
      return null;
    }
  })();
  document.documentElement.dataset.theme =
    new URLSearchParams(location.search).get('theme') ||
    saved ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const applyTokens = (theme, tokens) => {
    if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
    if (tokens && typeof tokens === 'object') {
      for (const [k, v] of Object.entries(tokens)) {
        if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string') {
          document.documentElement.style.setProperty(k, v);
        }
      }
    }
  };
  window.addEventListener('message', e => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'doc:theme' || e.data.type === 'lumzel:theme') document.documentElement.dataset.theme = e.data.theme;
    if (e.data.type === 'doc:tokens' || e.data.type === 'lumzel:tokens') applyTokens(e.data.theme, e.data.tokens);
  });
  // Inside the Lumzel page's frame: tell it the current screen, and let it open design Nodes in the whole window.
  const parent = window.parent !== window ? window.parent : null;
  const show = id => {
    if (!screens.length) return;
    const s = screens.find(x => x.dataset.docScreen === id) || screens[0];
    for (const x of screens) x.hidden = x !== s;
    window.scrollTo(0, 0);
    const intro = s.querySelector('[data-doc-intro]');
    if (parent)
      parent.postMessage(
        {
          type: 'doc:screen',
          id: s.dataset.docScreen,
          intro: intro ? intro.textContent.replace(/\s+/g, ' ').trim() : '',
        },
        '*',
      );
  };
  const docUrl = ref => {
    const [doc, node] = ref.split('#');
    const here = (location.pathname.match(/\/features\/([^/]+)\//) || [])[1];
    return `${doc === here ? '' : `../${doc}/`}design.html#${encodeURIComponent(node || '')}`;
  };

  const css = document.createElement('style');
  css.textContent = `
    /* tokens from DESIGN.md; the prototype does not load lumzel.css */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fg, #09090b) 14%, transparent); border: 3px solid transparent; border-radius: 999px; background-clip: content-box; min-height: 32px; min-width: 32px; }
    ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--fg, #09090b) 30%, transparent); background-clip: content-box; }
    :root[data-theme="dark"]::-webkit-scrollbar-thumb, :root[data-theme="dark"] ::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--fg, #fafafa) 14%, transparent); background-clip: content-box; }
    :root[data-theme="dark"]::-webkit-scrollbar-thumb:hover, :root[data-theme="dark"] ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--fg, #fafafa) 30%, transparent); background-clip: content-box; }
    .lumzel-proto-bar { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; display: flex; gap: 6px; font: 500 12px/1 var(--sans, "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif); }
    .lumzel-proto-bar a, .lumzel-proto-bar button { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border-strong, var(--border, #e4e4e7)); background: var(--surface, #fff); color: var(--fg, #09090b); text-decoration: none; cursor: pointer; font: inherit; box-shadow: var(--shadow-floating, var(--deck-shadow-lg, 0 16px 40px rgba(15,23,42,.14), 0 3px 10px rgba(15,23,42,.08))); }
    .lumzel-proto-bar button[aria-pressed="true"] { background: var(--primary, #18181b); border-color: var(--primary, #18181b); color: var(--primary-fg, #fafafa); }
    html.lumzel-linking [data-doc-node] { outline: 2px dashed var(--brand, #0070e3); outline-offset: 2px; cursor: alias; }
    html.lumzel-linking [data-doc-node]:hover { outline-style: solid; background-color: color-mix(in srgb, var(--brand, #0070e3) 8%, transparent); }
    .lumzel-proto-tip { position: fixed; z-index: 2147483647; pointer-events: none; padding: 4px 7px; border-radius: 4px; background: var(--primary, #18181b); color: var(--primary-fg, #fafafa); font: 11px/1.3 var(--mono, "Geist Mono", ui-monospace, monospace); box-shadow: var(--shadow-menu, var(--deck-shadow, 0 8px 24px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.05))); }
    :root[data-theme="dark"] .lumzel-proto-bar a, :root[data-theme="dark"] .lumzel-proto-bar button { background: var(--surface, #18181b); border-color: var(--border-strong, var(--border, rgba(255,255,255,.10))); color: var(--fg, #fafafa); }
    :root[data-theme="dark"] .lumzel-proto-bar button[aria-pressed="true"] { background: var(--primary, #e4e4e7); border-color: var(--primary, #e4e4e7); color: var(--primary-fg, #18181b); }
    @keyframes lumzel-flash { 0%, 100% { outline-color: transparent; } 50% { outline-color: var(--brand, #0070e3); } }
    .lumzel-proto-flash { outline: 3px solid var(--brand, #0070e3); outline-offset: 3px; animation: lumzel-flash .5s 3; }${
      bare
        ? `
    .lumzel-proto-bar, [data-doc-intro] { display: none !important; }`
        : ''
    }`;
  document.head.append(css);

  const parseLocale = raw => (String(raw || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
  let locale = parseLocale(
    query.get('lang') || document.documentElement.lang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en',
  );
  const protoLabels = () =>
    locale === 'zh'
      ? {
          btn: '设计联动',
          title: '点元素看它的设计 Node 与工单（L）；Alt+点击 直接打开设计',
        }
      : {
          btn: 'Link Design',
          title: 'Click an element to inspect its design Node and tickets (L); Alt+click to open design directly',
        };

  const bar = document.createElement('div');
  bar.className = 'lumzel-proto-bar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', 'false');
  const applyProtoLocale = () => {
    const l = protoLabels();
    toggle.textContent = l.btn;
    toggle.title = l.title;
  };
  applyProtoLocale();
  bar.append(toggle);
  document.body.append(bar);
  let labels = {}; // node id -> "label · Ticket NN" / "label · 工单 NN", pushed by the Lumzel page (doc:trace)
  const tip = document.createElement('div');
  tip.className = 'lumzel-proto-tip';
  tip.hidden = true;
  document.body.append(tip);

  const setLinking = on => {
    document.documentElement.classList.toggle('lumzel-linking', on);
    toggle.setAttribute('aria-pressed', String(on));
    if (!on) tip.hidden = true;
    if (parent) parent.postMessage({ type: 'doc:linking', on }, '*');
  };
  toggle.onclick = () => setLinking(toggle.getAttribute('aria-pressed') !== 'true');
  document.addEventListener('keydown', e => {
    // F / Esc toggle the Lumzel page's fullscreen (keys typed inside the frame never reach it otherwise)
    if (
      parent &&
      /^(f|escape)$/i.test(e.key) &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !/^(input|textarea|select)$/i.test(e.target.tagName) &&
      !e.target.isContentEditable
    )
      parent.postMessage({ type: 'doc:key', key: e.key.toLowerCase() }, '*');
    if (
      e.key.toLowerCase() === 'l' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !/^(input|textarea|select)$/i.test(e.target.tagName) &&
      !e.target.isContentEditable
    )
      setLinking(toggle.getAttribute('aria-pressed') !== 'true');
  });

  document.addEventListener(
    'click',
    e => {
      if (bar.contains(e.target)) return;
      const linking = e.altKey || document.documentElement.classList.contains('lumzel-linking');
      const node = linking && e.target.closest('[data-doc-node]');
      if (node) {
        e.preventDefault();
        e.stopPropagation();
        const url = new URL(docUrl(node.dataset.docNode), location.href).href;
        if (parent && !e.altKey) parent.postMessage({ type: 'doc:pick', ref: node.dataset.docNode }, '*');
        else if (parent) parent.postMessage({ type: 'doc:open', url }, '*');
        else location.href = url;
        return;
      }
      const go = e.target.closest('[data-goto]');
      if (go) {
        e.preventDefault();
        show(go.dataset.goto);
      }
    },
    true,
  );
  document.addEventListener('mousemove', e => {
    const node = document.documentElement.classList.contains('lumzel-linking') && e.target.closest('[data-doc-node]');
    tip.hidden = !node;
    if (node) {
      const id = node.dataset.docNode.split('#')[1];
      tip.textContent = labels[id] ? `${labels[id]} · ${id}` : `${node.dataset.docNode} ↗`;
      tip.style.left = `${e.clientX + 12}px`;
      tip.style.top = `${e.clientY + 14}px`;
    }
  });

  const open = want => {
    // #<node-id> (first screen that draws it), #<screen-id>, or #<screen-id>/<node-id> (that Node on that screen)
    const [sid, id] = (typeof want === 'string' ? want : decodeURIComponent(location.hash.slice(1)))
      .replace(/^([^/]*)$/, '/$1')
      .split('/');
    const scope = (sid && screens.find(x => x.dataset.docScreen === sid)) || document;
    const el =
      (id &&
        ([...scope.querySelectorAll('[data-doc-node]')].find(x => x.dataset.docNode.split('#')[1] === id) ||
          screens.find(x => x.dataset.docScreen === id))) ||
      (scope !== document && scope);
    const screen = el && (el.closest('[data-doc-screen]') || el);
    show(screen ? screen.dataset.docScreen : null);
    if (el)
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('lumzel-proto-flash');
        setTimeout(() => el.classList.remove('lumzel-proto-flash'), 1600);
      });
  };
  window.addEventListener('hashchange', () => open());
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'doc:show') open(e.data.id);
    if (e.data && e.data.type === 'doc:trace') labels = e.data.labels || {};
    if (e.data && e.data.type === 'doc:linking') setLinking(!!e.data.on);
    if (e.data && e.data.type === 'doc:locale') {
      const next = parseLocale(e.data.locale);
      if (next !== locale) {
        locale = next;
        applyProtoLocale();
      }
    }
  });
  open();
  // the host answers with doc:trace; a bare host draws its screen tabs from `screens` when it has no Trace
  if (parent)
    parent.postMessage(
      {
        type: 'doc:ready',
        screens: screens.map(x => ({
          id: x.dataset.docScreen,
          title: x.dataset.docTitle || x.dataset.docScreen,
        })),
      },
      '*',
    );
})();
